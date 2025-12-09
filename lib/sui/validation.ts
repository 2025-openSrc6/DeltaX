import { z } from 'zod';

export const suiIdSchema = z
  .string({ message: 'Sui object/address is required' })
  .regex(/^0x[0-9a-fA-F]+$/, 'Sui object/address must start with 0x and contain hex characters');

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
