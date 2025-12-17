import { createHash, randomUUID } from 'crypto';
import { BusinessRuleError } from '@/lib/shared/errors';
import { buildClaimPayoutTx, buildPlaceBetTx, buildShopPurchaseTx } from './builder';
import { getSponsorKeypair, suiClient } from './client';
import { getDelBalance as getDelBalanceRaw } from './balance';
import { getGasPayment } from './gas';
import type {
  BetPrediction,
  ExecuteSuiBetTxResult,
  ExecuteSuiClaimTxResult,
  PrepareSuiBetTxResult,
  ValidatedPrepareSuiBetTxInput,
  ValidatedPrepareSuiClaimTxInput,
  ValidatedExecuteSuiBetTxInput,
  ValidatedExecuteSuiClaimTxInput,
} from './types';
import type { NonceStore } from './nonceStore';
import { createNonceStore } from './nonceStore';
import { PREPARE_TX_TTL_MS, PREPARE_TX_TTL_SECONDS } from './constants';
import { sleep } from './utils';
import { findCreatedObjectIdByTypeContains, parsePayoutDistributedAmount } from './parsers';

// ============ Shop Purchase Types ============

export interface PrepareShopPurchaseInput {
  userAddress: string;
  userDelCoinId: string;
  itemId: string;
  amount: bigint;
}

export interface PrepareShopPurchaseResult {
  txBytes: string;
  nonce: string;
  expiresAt: number;
}

export interface ExecuteShopPurchaseInput {
  txBytes: string;
  userSignature: string;
  nonce: string;
  itemId: string;
  userAddress: string;
}

export interface ExecuteShopPurchaseResult {
  digest: string;
}

export class SuiService {
  constructor(private readonly nonceStore: NonceStore = createNonceStore()) {}

  async getDelBalance(ownerAddress: string): Promise<number> {
    try {
      const raw = await getDelBalanceRaw(ownerAddress);
      const DEL_DECIMALS = BigInt(9);
      const divisor = BigInt(10) ** DEL_DECIMALS;
      return Number(raw / divisor);
    } catch (error) {
      throw new BusinessRuleError('SUI_GET_BALANCE_FAILED', 'Failed to fetch DEL balance', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ============ Shop Purchase Methods ============

  async prepareShopPurchase(input: PrepareShopPurchaseInput): Promise<PrepareShopPurchaseResult> {
    const { userAddress, userDelCoinId, itemId, amount } = input;

    // 스폰서 로드
    let sponsor;
    try {
      sponsor = getSponsorKeypair();
    } catch (error) {
      throw new BusinessRuleError('ENV_MISSING', 'Sui sponsor key is not configured', {
        error: error instanceof Error ? error.message : error,
      });
    }
    const sponsorAddress = sponsor.toSuiAddress();

    // 트랜잭션 구성 (DEL burn)
    const tx = buildShopPurchaseTx({
      userAddress,
      userDelCoinId,
      amount,
    });

    // 가스비 설정
    const gasParams = await getGasPayment(sponsorAddress).catch((error) => {
      throw new BusinessRuleError('NO_GAS_COINS', 'Sponsor has no eligible gas coins', {
        error: error instanceof Error ? error.message : error,
      });
    });
    tx.setGasPayment(gasParams.gasPayment);
    tx.setGasBudget(gasParams.gasBudget);
    tx.setGasOwner(sponsorAddress);

    // PTB 빌드
    const txBytes = await tx.build({ client: suiClient });

    // Dry Run 검증
    const dryRun = await suiClient.dryRunTransactionBlock({ transactionBlock: txBytes });
    if (dryRun.effects.status.status === 'failure') {
      throw new BusinessRuleError('SUI_DRY_RUN_FAILED', 'Sui dry run failed', {
        error: dryRun.effects.status.error,
      });
    }

    // nonce 발급 및 저장
    const nonce = randomUUID();
    const expiresAt = Date.now() + PREPARE_TX_TTL_MS;
    const txBytesHash = createHash('sha256').update(txBytes).digest('hex');

    await this.nonceStore.save(
      nonce,
      {
        txBytesHash,
        expiresAt,
        betId: itemId, // itemId를 betId 필드에 저장 (재사용)
        userId: userAddress,
      },
      PREPARE_TX_TTL_SECONDS,
    );

    return { txBytes: Buffer.from(txBytes).toString('base64'), nonce, expiresAt };
  }

  async executeShopPurchase(input: ExecuteShopPurchaseInput): Promise<ExecuteShopPurchaseResult> {
    const { txBytes: txBytesBase64, userSignature, nonce, itemId, userAddress } = input;

    // nonce 소비
    const prepared = await this.nonceStore.consume(nonce);
    if (!prepared) {
      throw new BusinessRuleError('INVALID_NONCE', 'Nonce not found or already used/expired');
    }

    // 스폰서 로드
    const sponsor = getSponsorKeypair();

    // txBytes 버퍼화 및 해시 계산
    const txBytes = Buffer.from(txBytesBase64, 'base64');
    const txBytesHash = createHash('sha256').update(txBytes).digest('hex');

    // 검증
    if (prepared.txBytesHash !== txBytesHash) {
      throw new BusinessRuleError('TX_MISMATCH', 'Prepared transaction does not match execution');
    }
    if (Date.now() > prepared.expiresAt) {
      throw new BusinessRuleError('NONCE_EXPIRED', 'Prepared transaction has expired');
    }
    if (prepared.betId !== itemId) {
      throw new BusinessRuleError('ITEM_MISMATCH', 'Prepared item does not match execution itemId');
    }
    if (prepared.userId !== userAddress) {
      throw new BusinessRuleError(
        'USER_MISMATCH',
        'Prepared user does not match execution userAddress',
      );
    }

    // 스폰서 서명 및 실행
    // NOTE: WaitForLocalExecution는 RPC/노드 상태에 따라 timeout이 잦아서,
    // WaitForEffectsCert + 재시도로 안정성을 높인다.
    let executed;
    const sponsorSigned = await sponsor.signTransaction(txBytes);
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        executed = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature: [userSignature, sponsorSigned.signature],
          requestType: 'WaitForEffectsCert',
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isRateLimit = /429|rate limit/i.test(message);
        const isTimeout = /timeout|timed out|deadline/i.test(message);
        const isRetryable =
          isRateLimit || isTimeout || /502|503|504|ECONNRESET|fetch failed/i.test(message);
        if (attempt < maxAttempts && isRetryable) {
          await sleep(300 * attempt);
          continue;
        }
        throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute failed', {
          error: message,
          category: isRateLimit ? 'rate_limit' : isTimeout ? 'timeout' : 'rpc',
          attempt,
          requestType: 'WaitForEffectsCert',
        });
      }
    }

    if (!executed?.digest) {
      throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute response missing digest');
    }

    const digest = executed.digest;
    await this.ensureOnChain(digest);

    return { digest };
  }

  // ============ Betting Methods ============

  async prepareBetTransaction(
    input: ValidatedPrepareSuiBetTxInput,
  ): Promise<PrepareSuiBetTxResult> {
    const { userAddress, poolId, prediction, userDelCoinIds, amount, betId, userId } = input;

    // 스폰서 로드
    let sponsor;
    try {
      sponsor = getSponsorKeypair();
    } catch (error) {
      throw new BusinessRuleError('ENV_MISSING', 'Sui sponsor key is not configured', {
        error: error instanceof Error ? error.message : error,
      });
    }
    // 스폰서 주소
    const sponsorAddress = sponsor.toSuiAddress();

    // 트랜잭션 구성 (merge + split + place_bet)
    const tx = buildPlaceBetTx({
      userAddress,
      poolId,
      prediction: prediction as BetPrediction,
      userDelCoinIds,
      amount,
    });

    // 가스비 설정
    const gasParams = await getGasPayment(sponsorAddress).catch((error) => {
      throw new BusinessRuleError('NO_GAS_COINS', 'Sponsor has no eligible gas coins', {
        error: error instanceof Error ? error.message : error,
      });
    });
    tx.setGasPayment(gasParams.gasPayment);
    tx.setGasBudget(gasParams.gasBudget);
    tx.setGasOwner(sponsorAddress);

    // PTB 트랜잭션 빌드
    const txBytes = await tx.build({ client: suiClient });

    // PTB 건너기 (Dry Run)
    const dryRun = await suiClient.dryRunTransactionBlock({ transactionBlock: txBytes });
    if (dryRun.effects.status.status === 'failure') {
      throw new BusinessRuleError('SUI_DRY_RUN_FAILED', 'Sui dry run failed', {
        error: dryRun.effects.status.error,
      });
    }

    // nonce 발급 및 저장
    const nonce = randomUUID();
    const expiresAt = Date.now() + PREPARE_TX_TTL_MS;
    const txBytesHash = createHash('sha256').update(txBytes).digest('hex');

    await this.nonceStore.save(
      nonce,
      {
        action: 'BET',
        txBytesHash,
        expiresAt,
        betId,
        userId,
      },
      PREPARE_TX_TTL_SECONDS,
    );

    return { txBytes: Buffer.from(txBytes).toString('base64'), nonce, expiresAt };
  }

  async executeBetTransaction(
    input: ValidatedExecuteSuiBetTxInput,
  ): Promise<ExecuteSuiBetTxResult> {
    const { txBytes: txBytesBase64, userSignature, nonce, betId, userId } = input;

    // nonce 소비
    const prepared = await this.nonceStore.consume(nonce);
    if (!prepared) {
      throw new BusinessRuleError('INVALID_NONCE', 'Nonce not found or already used/expired');
    }

    // 스폰서 로드
    const sponsor = getSponsorKeypair();

    // txBytes 복원 및 해시 계산
    // NOTE: Sui SDK expects transactionBlock as Uint8Array (not a Node Buffer JSON-ish shape).
    const txBytesBuffer = Buffer.from(txBytesBase64, 'base64');
    const txBytes = new Uint8Array(txBytesBuffer);
    const txBytesHash = createHash('sha256').update(txBytes).digest('hex');

    // txBytes 검증
    if (prepared.txBytesHash !== txBytesHash) {
      throw new BusinessRuleError('TX_MISMATCH', 'Prepared transaction does not match execution');
    }
    const action = prepared.action ?? 'BET';
    if (action !== 'BET') {
      throw new BusinessRuleError('TX_MISMATCH', 'Prepared transaction action mismatch', {
        expected: 'BET',
        actual: action,
      });
    }
    // nonce 만료 검증
    if (Date.now() > prepared.expiresAt) {
      throw new BusinessRuleError('NONCE_EXPIRED', 'Prepared transaction has expired');
    }
    if (prepared.betId !== betId) {
      throw new BusinessRuleError('BET_MISMATCH', 'Prepared bet does not match execution betId');
    }
    if (prepared.userId !== userId) {
      throw new BusinessRuleError('USER_MISMATCH', 'Prepared user does not match execution userId');
    }

    // 스폰서 서명 및 실행
    // NOTE: WaitForLocalExecution는 RPC/노드 상태에 따라 timeout이 잦아서,
    // WaitForEffectsCert + 재시도로 안정성을 높인다.
    let executed;
    const sponsorSigned = await sponsor.signTransaction(txBytes);
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        executed = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature: [userSignature, sponsorSigned.signature],
          requestType: 'WaitForEffectsCert',
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isRateLimit = /429|rate limit/i.test(message);
        const isTimeout = /timeout|timed out|deadline/i.test(message);
        const isRetryable =
          isRateLimit || isTimeout || /502|503|504|ECONNRESET|fetch failed/i.test(message);
        if (attempt < maxAttempts && isRetryable) {
          await sleep(300 * attempt);
          continue;
        }
        throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute failed', {
          error: message,
          category: isRateLimit ? 'rate_limit' : isTimeout ? 'timeout' : 'rpc',
          attempt,
          requestType: 'WaitForEffectsCert',
        });
      }
    }

    // digest 검증
    if (!executed?.digest) {
      throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute response missing digest');
    }

    const digest = executed.digest;

    // 체인 실행 확인
    const confirmed = await this.ensureOnChain(digest);

    const betObjectId = findCreatedObjectIdByTypeContains(confirmed.objectChanges ?? undefined, {
      contains: '::betting::Bet',
      excludes: ['::betting::BettingPool'],
    });
    if (!betObjectId) {
      throw new BusinessRuleError('SUI_PARSE_FAILED', 'Failed to parse created Bet object id', {
        digest,
      });
    }

    return { digest, betObjectId };
  }

  async prepareClaimTransaction(
    input: ValidatedPrepareSuiClaimTxInput,
  ): Promise<PrepareSuiBetTxResult> {
    const { userAddress, poolId, settlementId, betObjectId, betId, userId } = input;

    // 스폰서 로드
    let sponsor;
    try {
      sponsor = getSponsorKeypair();
    } catch (error) {
      throw new BusinessRuleError('ENV_MISSING', 'Sui sponsor key is not configured', {
        error: error instanceof Error ? error.message : error,
      });
    }
    const sponsorAddress = sponsor.toSuiAddress();

    const tx = buildClaimPayoutTx({ userAddress, poolId, settlementId, betObjectId });

    const gasParams = await getGasPayment(sponsorAddress).catch((error) => {
      throw new BusinessRuleError('NO_GAS_COINS', 'Sponsor has no eligible gas coins', {
        error: error instanceof Error ? error.message : error,
      });
    });
    tx.setGasPayment(gasParams.gasPayment);
    tx.setGasBudget(gasParams.gasBudget);
    tx.setGasOwner(sponsorAddress);

    const txBytes = await tx.build({ client: suiClient });

    const dryRun = await suiClient.dryRunTransactionBlock({ transactionBlock: txBytes });
    if (dryRun.effects.status.status === 'failure') {
      throw new BusinessRuleError('SUI_DRY_RUN_FAILED', 'Sui dry run failed', {
        error: dryRun.effects.status.error,
      });
    }

    const nonce = randomUUID();
    const expiresAt = Date.now() + PREPARE_TX_TTL_MS;
    const txBytesHash = createHash('sha256').update(txBytes).digest('hex');

    await this.nonceStore.save(
      nonce,
      {
        action: 'CLAIM',
        txBytesHash,
        expiresAt,
        betId,
        userId,
      },
      PREPARE_TX_TTL_SECONDS,
    );

    return { txBytes: Buffer.from(txBytes).toString('base64'), nonce, expiresAt };
  }

  async executeClaimTransaction(
    input: ValidatedExecuteSuiClaimTxInput,
  ): Promise<ExecuteSuiClaimTxResult> {
    const { txBytes: txBytesBase64, userSignature, nonce, betId, userId } = input;

    const prepared = await this.nonceStore.consume(nonce);
    if (!prepared) {
      throw new BusinessRuleError('INVALID_NONCE', 'Nonce not found or already used/expired');
    }

    const sponsor = getSponsorKeypair();

    const txBytes = Buffer.from(txBytesBase64, 'base64');
    const txBytesHash = createHash('sha256').update(txBytes).digest('hex');

    if (prepared.txBytesHash !== txBytesHash) {
      throw new BusinessRuleError('TX_MISMATCH', 'Prepared transaction does not match execution');
    }
    const action = prepared.action ?? 'BET';
    if (action !== 'CLAIM') {
      throw new BusinessRuleError('TX_MISMATCH', 'Prepared transaction action mismatch', {
        expected: 'CLAIM',
        actual: action,
      });
    }
    if (Date.now() > prepared.expiresAt) {
      throw new BusinessRuleError('NONCE_EXPIRED', 'Prepared transaction has expired');
    }
    if (prepared.betId !== betId) {
      throw new BusinessRuleError('BET_MISMATCH', 'Prepared bet does not match execution betId');
    }
    if (prepared.userId !== userId) {
      throw new BusinessRuleError('USER_MISMATCH', 'Prepared user does not match execution userId');
    }

    // NOTE: WaitForLocalExecution는 RPC/노드 상태에 따라 timeout이 잦아서,
    // WaitForEffectsCert + 재시도로 안정성을 높인다.
    let executed;
    const sponsorSigned = await sponsor.signTransaction(txBytes);
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        executed = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature: [userSignature, sponsorSigned.signature],
          requestType: 'WaitForEffectsCert',
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isRateLimit = /429|rate limit/i.test(message);
        const isTimeout = /timeout|timed out|deadline/i.test(message);
        const isRetryable =
          isRateLimit || isTimeout || /502|503|504|ECONNRESET|fetch failed/i.test(message);
        if (attempt < maxAttempts && isRetryable) {
          await sleep(300 * attempt);
          continue;
        }
        throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute failed', {
          error: message,
          category: isRateLimit ? 'rate_limit' : isTimeout ? 'timeout' : 'rpc',
          attempt,
          requestType: 'WaitForEffectsCert',
        });
      }
    }

    if (!executed?.digest) {
      throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute response missing digest');
    }

    const digest = executed.digest;
    const confirmed = await this.ensureOnChain(digest);

    const payoutAmount = parsePayoutDistributedAmount(confirmed.events ?? undefined, {
      eventTypeContains: '::betting::PayoutDistributed',
    });

    const payoutTimestampMs =
      typeof confirmed.timestampMs === 'string' ? Number(confirmed.timestampMs) : undefined;

    return { digest, payoutAmount, payoutTimestampMs };
  }

  private async ensureOnChain(digest: string, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await suiClient.getTransactionBlock({
          digest,
          options: { showEffects: true, showObjectChanges: true, showEvents: true },
        });

        const status = res?.effects?.status;
        if (status?.status === 'success') {
          return res;
        }

        if (status?.status === 'failure') {
          const detailMsg = status.error ? `: ${status.error}` : '';
          throw new BusinessRuleError(
            'SUI_EXECUTE_FAILED',
            'Sui execution failed on chain' + detailMsg,
            {
              error: status.error,
              digest,
            },
          );
        }
      } catch (error) {
        if (error instanceof BusinessRuleError) {
          throw error;
        }
        // swallow and retry for transport/availability errors
      }
      await sleep(delayMs);
    }
    throw new BusinessRuleError('SUI_TX_NOT_FOUND', 'Transaction submitted but not found yet', {
      digest,
    });
  }
}
