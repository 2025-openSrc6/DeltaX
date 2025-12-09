import { createHash, randomUUID } from 'crypto';
import { BusinessRuleError } from '@/lib/shared/errors';
import { buildPlaceBetTx } from './builder';
import { getSponsorKeypair, suiClient } from './client';
import { getGasPayment } from './gas';
import type {
  BetPrediction,
  ExecuteSuiBetTxResult,
  PrepareSuiBetTxResult,
  ValidatedPrepareSuiBetTxInput,
  ValidatedExecuteSuiBetTxInput,
} from './types';
import type { NonceStore } from './nonceStore';
import { UpstashNonceStore } from './nonceStore';
import { PREPARE_TX_TTL_MS, PREPARE_TX_TTL_SECONDS } from './constants';
import { sleep } from './utils';

export class SuiService {
  constructor(private readonly nonceStore: NonceStore = new UpstashNonceStore()) {}

  async prepareBetTransaction(
    input: ValidatedPrepareSuiBetTxInput,
  ): Promise<PrepareSuiBetTxResult> {
    const { userAddress, poolId, prediction, userDelCoinId, betId, userId } = input;

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

    // 트랜잭션 구성
    const tx = buildPlaceBetTx({
      userAddress,
      poolId,
      prediction: prediction as BetPrediction,
      userDelCoinId,
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

    // txBytes 버퍼화 및 해시 계산
    const txBytes = Buffer.from(txBytesBase64, 'base64');
    const txBytesHash = createHash('sha256').update(txBytes).digest('hex');

    // txBytes 검증
    if (prepared.txBytesHash !== txBytesHash) {
      throw new BusinessRuleError('TX_MISMATCH', 'Prepared transaction does not match execution');
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
    let executed;
    try {
      // 스폰서 서명
      const sponsorSigned = await sponsor.signTransaction(txBytes);
      // 체인 실행
      executed = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [userSignature, sponsorSigned.signature],
        requestType: 'WaitForLocalExecution',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 비율 제한 검증
      const isRateLimit = /429|rate limit/i.test(message);
      // 타임아웃 검증
      const isTimeout = /timeout|timed out|deadline/i.test(message);
      // 에러 반환
      throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute failed', {
        error: message,
        category: isRateLimit ? 'rate_limit' : isTimeout ? 'timeout' : 'rpc',
      });
    }

    // digest 검증
    if (!executed?.digest) {
      throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute response missing digest');
    }

    const digest = executed.digest;

    // 체인 실행 확인
    await this.ensureOnChain(digest);

    return { digest };
  }

  private async ensureOnChain(digest: string, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await suiClient.getTransactionBlock({
          digest,
          options: { showEffects: true },
        });

        const status = res?.effects?.status;
        if (status?.status === 'success') {
          return res;
        }

        if (status?.status === 'failure') {
          throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execution failed on chain', {
            error: status.error,
            digest,
          });
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
