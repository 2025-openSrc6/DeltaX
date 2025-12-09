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
