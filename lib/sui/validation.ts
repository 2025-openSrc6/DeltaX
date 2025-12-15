import { z } from 'zod';

export const suiIdSchema = z
  .string({ message: 'Sui object/address is required' })
  .regex(/^0x[0-9a-fA-F]+$/, 'Sui object/address must start with 0x and contain hex characters');

export const suiAddressSchema = suiIdSchema.describe('Sui address (0x...)');

const base64Schema = z
  .string({ message: 'Value is required' })
  .regex(/^[A-Za-z0-9+/=]+$/, 'Value must be a base64-encoded string');

export const executeSuiBetTxSchema = z.object({
  txBytes: base64Schema.describe('Base64-encoded transaction bytes'),
  userSignature: base64Schema.describe('Base64-encoded user signature from wallet'),
  nonce: z.string({ message: 'nonce is required' }).min(8, 'nonce must be at least 8 characters'),
  betId: z.string({ message: 'betId is required' }).uuid('betId must be a valid UUID'),
  userId: z.string({ message: 'userId is required' }).uuid('userId must be a valid UUID'),
});

// ============ Admin (Cron) Wrapper Schemas ============

const finitePositiveNumber = z.number().finite().positive();
const finiteNonNegativeNumber = z.number().finite().nonnegative();

/**
 * 가격은 *100 (소수점 2자리)로 스케일링되어 on-chain `u64`로 들어감.
 * - JS number의 안전 정밀도를 위해 상한을 둠.
 */
export const priceNumberSchema = finitePositiveNumber.max(1e13);

/**
 * avgVol(%)는 *10_000 스케일링되어 on-chain `u64`로 들어감.
 * - 스펙상 매우 작아야 하므로 넉넉히 1000% 상한.
 */
// avgVol이 0이면 VOID로 처리할 수 있으므로 0 허용
export const avgVolNumberSchema = finiteNonNegativeNumber.max(1000);

export const createPoolInputSchema = z.object({
  roundNumber: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lockTimeMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  endTimeMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export const lockPoolInputSchema = z.object({
  poolId: suiIdSchema,
});

export const finalizeRoundInputSchema = z.object({
  poolId: suiIdSchema,
  prices: z.object({
    goldStart: priceNumberSchema,
    goldEnd: priceNumberSchema,
    btcStart: priceNumberSchema,
    btcEnd: priceNumberSchema,
  }),
  avgVols: z.object({
    goldAvgVol: avgVolNumberSchema,
    btcAvgVol: avgVolNumberSchema,
  }),
  volMeta: z.unknown().optional(),
});

export const distributePayoutInputSchema = z.object({
  poolId: suiIdSchema,
  settlementId: suiIdSchema,
  betObjectId: suiIdSchema,
});

export const mintDelInputSchema = z.object({
  toAddress: suiAddressSchema,
  amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
