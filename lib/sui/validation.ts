import { z } from 'zod';

const suiIdSchema = z.string().regex(/^0x[0-9a-fA-F]+$/, 'Invalid Sui object/address format');

export const prepareSuiBetTxSchema = z.object({
  userAddress: suiIdSchema,
  poolId: suiIdSchema,
  prediction: z.union([z.literal(1), z.literal(2)]).describe('1: GOLD, 2: BTC'),
  userDelCoinId: suiIdSchema,
});
