import { BusinessRuleError } from '@/lib/shared/errors';
import { buildPlaceBetTx } from './builder';
import { getSponsorKeypair, suiClient } from './client';
import { getGasPayment } from './gas';
import type { PrepareSuiBetTxResult } from './types';
import { prepareSuiBetTxSchema } from './validation';

export class SuiService {
  async prepareBetTransaction(rawParams: unknown): Promise<PrepareSuiBetTxResult> {
    // 검증
    const { userAddress, poolId, prediction, userDelCoinId } =
      prepareSuiBetTxSchema.parse(rawParams);

    const sponsor = getSponsorKeypair();
    const sponsorAddress = sponsor.toSuiAddress();

    // 트랜잭션 생성
    const tx = buildPlaceBetTx({ userAddress, poolId, prediction, userDelCoinId });

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

    return { txBytes: Buffer.from(txBytes).toString('base64') };
  }
}
