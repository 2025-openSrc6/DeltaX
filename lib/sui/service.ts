import { createHash, randomUUID } from 'crypto';
import { BusinessRuleError } from '@/lib/shared/errors';
import { BetService } from '@/lib/bets/service';
import { buildPlaceBetTx } from './builder';
import { getSponsorKeypair, suiClient } from './client';
import { getGasPayment } from './gas';
import type { BetPrediction, ExecuteSuiBetTxResult, PrepareSuiBetTxResult } from './types';
import { executeSuiBetTxSchema, prepareSuiBetTxSchema } from './validation';
import type { NonceStore } from './nonceStore';
import { UpstashNonceStore } from './nonceStore';
import { PREPARE_TX_TTL_MS, PREPARE_TX_TTL_SECONDS } from './constants';
import { sleep } from './utils';

export class SuiService {
  constructor(
    private readonly betService: BetService = new BetService(),
    private readonly nonceStore: NonceStore = new UpstashNonceStore(),
  ) {}

  async prepareBetTransaction(rawParams: unknown): Promise<PrepareSuiBetTxResult> {
    const { userAddress, poolId, prediction, userDelCoinId, betId, userId } =
      prepareSuiBetTxSchema.parse(rawParams);

    const sponsor = getSponsorKeypair();
    const sponsorAddress = sponsor.toSuiAddress();

    // 트랜잭션 생성
    const tx = buildPlaceBetTx({
      userAddress,
      poolId,
      prediction: prediction as BetPrediction,
      userDelCoinId,
    });

    // 가스비 설정
    const gasParams = await getGasPayment(sponsorAddress);
    tx.setGasPayment(gasParams.gasPayment);
    tx.setGasBudget(gasParams.gasBudget);
    tx.setGasOwner(sponsorAddress);

    // 트랜잭션 빌드
    const txBytes = await tx.build({ client: suiClient });

    // 트랜잭션 건너기 (Dry Run)
    // 잔액 부족, 라운드 종료 등의 에러를 여기서 잡아서 프론트에 알려줌
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
        txBytesHash,
        expiresAt,
        betId,
        userId,
      },
      PREPARE_TX_TTL_SECONDS,
    );

    return { txBytes: Buffer.from(txBytes).toString('base64'), nonce, expiresAt };
  }

  async executeBetTransaction(rawParams: unknown): Promise<ExecuteSuiBetTxResult> {
    const {
      txBytes: txBytesBase64,
      userSignature,
      nonce,
      betId,
      userId,
    } = executeSuiBetTxSchema.parse(rawParams);

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
    if (Date.now() > prepared.expiresAt) {
      throw new BusinessRuleError('NONCE_EXPIRED', 'Prepared transaction has expired');
    }
    if (prepared.betId !== betId) {
      throw new BusinessRuleError('BET_MISMATCH', 'Prepared bet does not match execution betId');
    }
    if (prepared.userId !== userId) {
      throw new BusinessRuleError('USER_MISMATCH', 'Prepared user does not match execution userId');
    }

    try {
      const sponsorSigned = await sponsor.signTransaction(txBytes);
      const executed = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [userSignature, sponsorSigned.signature],
        requestType: 'WaitForLocalExecution',
      });

      if (!executed?.digest) {
        throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute response missing digest');
      }

      await this.ensureOnChain(executed.digest);

      // DB 업데이트: 베팅 레코드에 체인 트랜잭션 해시 기록
      await this.betService.updateBet(betId, {
        suiTxHash: executed.digest,
        processedAt: Date.now(),
      });

      return { digest: executed.digest };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown execute error';
      throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute failed', { error: message });
    }
  }

  private async ensureOnChain(digest: string, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await suiClient.getTransactionBlock({ digest });
        if (res) return res;
      } catch {
        // swallow and retry
      }
      await sleep(delayMs);
    }
    throw new BusinessRuleError('SUI_TX_NOT_FOUND', 'Transaction submitted but not found yet', {
      digest,
    });
  }
}
