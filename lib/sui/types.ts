import { z } from 'zod';
import { executeSuiBetTxSchema, prepareSuiBetTxSchema } from './validation';

export type BetPrediction = 1 | 2;
export type PrepareSuiBetTxInput = z.infer<typeof prepareSuiBetTxSchema>;
export type ExecuteSuiBetTxInput = z.infer<typeof executeSuiBetTxSchema>;

export interface PrepareSuiBetTxResult {
  txBytes: string;
  nonce: string;
  expiresAt: number;
}

export interface ExecuteSuiBetTxResult {
  digest: string;
}
