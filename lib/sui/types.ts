import { z } from 'zod';
import { prepareSuiBetTxSchema } from './validation';

export type BetPrediction = 1 | 2;
export type PrepareSuiBetTxInput = z.infer<typeof prepareSuiBetTxSchema>;

export interface PrepareSuiBetTxResult {
  txBytes: string;
}
