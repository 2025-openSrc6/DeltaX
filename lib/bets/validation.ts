import { z } from 'zod';
import { suiIdSchema } from '../sui/validation';

/**
 * POST /api/bets Request Body 검증
 */
export const createBetSchema = z.object({
  roundId: z.string().uuid('Invalid UUID format'),
  prediction: z.enum(['GOLD', 'BTC'], {
    message: 'prediction must be one of: GOLD, BTC',
  }),
  amount: z
    .number()
    .int('Bet amount must be an integer')
    .min(100, 'Minimum bet amount is 100')
    .max(1000000, 'Maximum bet amount is 1,000,000'),
});

/**
 * GET /api/bets Query Parameters 검증
 */
export const getBetsQuerySchema = z.object({
  roundId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  prediction: z.enum(['GOLD', 'BTC']).optional(),
  resultStatus: z.string().optional(),
  settlementStatus: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['created_at', 'amount']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /api/bets/public Query Parameters 검증
 * - 공개 피드에서는 userId 필터를 받지 않는다.
 */
export const getPublicBetsQuerySchema = z.object({
  roundId: z.string().uuid().optional(),
  prediction: z.enum(['GOLD', 'BTC']).optional(),
  resultStatus: z.string().optional(),
  settlementStatus: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['created_at', 'amount']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const createBetWithSuiPrepareSchema = z.object({
  roundId: z.string().uuid('Invalid UUID format'),
  prediction: z.enum(['GOLD', 'BTC'], {
    message: 'prediction must be one of: GOLD, BTC',
  }),
  amount: z
    .number()
    .int('Bet amount must be an integer')
    .min(100, 'Minimum bet amount is 100')
    .max(1000000, 'Maximum bet amount is 1,000,000'),
  userAddress: suiIdSchema.describe('User Sui address'),
  userDelCoinIds: z
    .array(suiIdSchema)
    .min(1, 'At least one DEL coin is required')
    .max(256, 'Maximum 256 coins can be merged')
    .describe('User-owned DEL Coin object ids for merge+split'),
});

export const prepareClaimSchema = z.object({
  betId: z.string().uuid('betId must be a valid UUID'),
});

export const executeClaimSchema = z.object({
  betId: z.string().uuid('betId must be a valid UUID'),
  txBytes: z
    .string({ message: 'txBytes is required' })
    .regex(/^[A-Za-z0-9+/=]+$/, 'txBytes must be a base64-encoded string'),
  userSignature: z
    .string({ message: 'userSignature is required' })
    .regex(/^[A-Za-z0-9+/=]+$/, 'userSignature must be a base64-encoded string'),
  nonce: z.string({ message: 'nonce is required' }).min(8, 'nonce must be at least 8 characters'),
});
