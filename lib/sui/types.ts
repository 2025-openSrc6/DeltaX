import { z } from 'zod';
import { executeSuiBetTxSchema } from './validation';

export type BetPrediction = 1 | 2;
export type ExecuteSuiBetTxInput = z.infer<typeof executeSuiBetTxSchema>;

export interface PrepareSuiBetTxResult {
  txBytes: string;
  nonce: string;
  expiresAt: number;
}

export interface ExecuteSuiBetTxResult {
  digest: string;
}

export interface ValidatedPrepareSuiBetTxInput {
  userAddress: string;
  userDelCoinId: string;
  poolId: string;
  prediction: BetPrediction;
  betId: string;
  userId: string;
}

export interface ValidatedExecuteSuiBetTxInput {
  txBytes: string;
  userSignature: string;
  nonce: string;
  betId: string;
  userId: string;
}

// ============ Admin (Cron) Wrapper Types ============

export interface CreatePoolInput {
  /**
   * On-chain `round_id` (Move `u64`)
   * - Offchain UUID가 아니라, D1의 `roundNumber` 같은 숫자 식별자를 사용해야 함.
   */
  roundNumber: number;
  lockTimeMs: number;
  endTimeMs: number;
}

export interface CreatePoolResult {
  poolId: string;
  txDigest: string;
}

export interface LockPoolInput {
  poolId: string;
}

export interface LockPoolResult {
  txDigest: string;
}

export interface FinalizeRoundInput {
  poolId: string;
  prices: {
    goldStart: number;
    goldEnd: number;
    btcStart: number;
    btcEnd: number;
  };
  avgVols: {
    goldAvgVol: number;
    btcAvgVol: number;
  };
  /**
   * Off-chain 감사/재현용 메타.
   * - on-chain으로 전달되지 않음 (DB 저장용)
   */
  volMeta?: unknown;
}

export interface FinalizeRoundResult {
  settlementId: string;
  feeCoinId: string;
  txDigest: string;
}

export interface DistributePayoutInput {
  poolId: string;
  settlementId: string;
  betObjectId: string;
}

export interface DistributePayoutResult {
  payoutCoinId: string;
  txDigest: string;
}

export interface MintDelInput {
  toAddress: string;
  /**
   * Amount in smallest units (Move `u64`)
   * - DEL decimals = 9
   */
  amount: number;
}

export interface MintDelResult {
  txDigest: string;
}
