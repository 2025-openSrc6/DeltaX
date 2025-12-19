import { describe, it, expect } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiService } from '@/lib/sui/service';
import type { NonceStore, PreparedTxRecord } from '@/lib/sui/nonceStore';

type RequiredEnv =
  | 'SUI_RPC_URL'
  | 'SUI_SPONSOR_PRIVATE_KEY'
  | 'SUI_PACKAGE_ID'
  | 'SUI_INT_POOL_ID'
  | 'SUI_INT_USER_ADDRESS'
  | 'SUI_INT_USER_PRIVATE_KEY'
  | 'SUI_INT_USER_DEL_COIN_ID';

const env = (key: RequiredEnv) => process.env[key];
const missingEnv = (
  [
    'SUI_RPC_URL',
    'SUI_SPONSOR_PRIVATE_KEY',
    'SUI_PACKAGE_ID',
    'SUI_INT_POOL_ID',
    'SUI_INT_USER_ADDRESS',
    'SUI_INT_USER_PRIVATE_KEY',
    'SUI_INT_USER_DEL_COIN_ID',
  ] as RequiredEnv[]
).filter((k) => !env(k));

// In-memory nonce store to avoid external Redis dependency during integration runs
class InMemoryNonceStore implements NonceStore {
  private store = new Map<string, PreparedTxRecord>();

  async save(nonce: string, record: PreparedTxRecord): Promise<void> {
    this.store.set(nonce, record);
  }

  async consume(nonce: string): Promise<PreparedTxRecord | null> {
    const record = this.store.get(nonce) ?? null;
    this.store.delete(nonce);
    return record;
  }
}

const loadKeypair = (base64: string) => {
  const raw = Buffer.from(base64, 'base64');
  const secretKey = raw.length === 33 ? raw.slice(1) : raw;
  return Ed25519Keypair.fromSecretKey(secretKey);
};

if (missingEnv.length > 0) {
  describe.skip('SuiService integration (env not provided)', () => {
    it(`skipped: missing env ${missingEnv.join(', ')}`, () => {});
  });
} else {
  describe('SuiService integration (real RPC)', () => {
    const service = new SuiService(new InMemoryNonceStore());
    const userKeypair = loadKeypair(env('SUI_INT_USER_PRIVATE_KEY')!);

    const prepareInput = {
      userAddress: env('SUI_INT_USER_ADDRESS')!,
      userDelCoinId: env('SUI_INT_USER_DEL_COIN_ID')!,
      poolId: env('SUI_INT_POOL_ID')!,
      prediction: 1 as const,
      betId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
    };

    it('executes prepare -> execute on-chain success', { timeout: 60_000 }, async () => {
      const prepared = await service.prepareBetTransaction(prepareInput);

      const txBytes = Buffer.from(prepared.txBytes, 'base64');
      const userSigned = await userKeypair.signTransaction(txBytes);

      const executed = await service.executeBetTransaction({
        txBytes: prepared.txBytes,
        userSignature: userSigned.signature,
        nonce: prepared.nonce,
        betId: prepareInput.betId,
        userId: prepareInput.userId,
      });

      expect(executed.digest).toBeTruthy();
    });

    it('rejects reused nonce on second execution attempt', { timeout: 60_000 }, async () => {
      const prepared = await service.prepareBetTransaction(prepareInput);
      const txBytes = Buffer.from(prepared.txBytes, 'base64');
      const userSigned = await userKeypair.signTransaction(txBytes);

      await service.executeBetTransaction({
        txBytes: prepared.txBytes,
        userSignature: userSigned.signature,
        nonce: prepared.nonce,
        betId: prepareInput.betId,
        userId: prepareInput.userId,
      });

      await expect(
        service.executeBetTransaction({
          txBytes: prepared.txBytes,
          userSignature: userSigned.signature,
          nonce: prepared.nonce,
          betId: prepareInput.betId,
          userId: prepareInput.userId,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_NONCE' });
    });
  });
}
