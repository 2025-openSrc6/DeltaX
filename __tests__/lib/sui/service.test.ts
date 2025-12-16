import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

const {
  mockGetSponsorKeypair,
  mockDryRunTransactionBlock,
  mockExecuteTransactionBlock,
  mockGetTransactionBlock,
  mockGetGasPayment,
  mockBuildPlaceBetTx,
  mockSleep,
  mockGetBalance,
  mockGetCoins,
} = vi.hoisted(() => ({
  mockGetSponsorKeypair: vi.fn(),
  mockDryRunTransactionBlock: vi.fn(),
  mockExecuteTransactionBlock: vi.fn(),
  mockGetTransactionBlock: vi.fn(),
  mockGetGasPayment: vi.fn(),
  mockBuildPlaceBetTx: vi.fn(),
  mockSleep: vi.fn(),
  mockGetBalance: vi.fn(),
  mockGetCoins: vi.fn(),
}));

vi.mock('@/lib/sui/client', () => ({
  getSponsorKeypair: mockGetSponsorKeypair,
  suiClient: {
    dryRunTransactionBlock: mockDryRunTransactionBlock,
    executeTransactionBlock: mockExecuteTransactionBlock,
    getTransactionBlock: mockGetTransactionBlock,
    getBalance: mockGetBalance,
    getCoins: mockGetCoins,
  },
  get PACKAGE_ID() {
    return process.env.NEXT_PUBLIC_SUI_PACKAGE_ID || process.env.SUI_PACKAGE_ID || '0x0';
  },
}));

vi.mock('@/lib/sui/gas', () => ({
  getGasPayment: mockGetGasPayment,
}));

vi.mock('@/lib/sui/builder', () => ({
  buildPlaceBetTx: mockBuildPlaceBetTx,
}));

vi.mock('@/lib/sui/utils', () => ({
  sleep: mockSleep,
}));

import { SuiService } from '@/lib/sui/service';
import { PREPARE_TX_TTL_MS, PREPARE_TX_TTL_SECONDS } from '@/lib/sui/constants';
import { BusinessRuleError } from '@/lib/shared/errors';
import type { NonceStore, PreparedTxRecord } from '@/lib/sui/nonceStore';

const TX_BYTES = new Uint8Array([1, 2, 3]);
const TX_BYTES_BASE64 = Buffer.from(TX_BYTES).toString('base64');
const TX_HASH = createHash('sha256').update(TX_BYTES).digest('hex');
const NOW = new Date('2025-01-01T00:00:00Z').getTime();
const NONCE = '00000000-0000-0000-0000-000000000000';

const basePrepareParams = {
  userAddress: '0x1a2b3c4d',
  poolId: '0x5e6f7a8b',
  prediction: 1 as const,
  userDelCoinId: '0x9c0d1e2f',
  betId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
};

const baseExecuteParams = {
  txBytes: TX_BYTES_BASE64,
  userSignature: 'user-signature',
  nonce: NONCE,
  betId: basePrepareParams.betId,
  userId: basePrepareParams.userId,
};

const createPreparedRecord = (overrides: Partial<PreparedTxRecord> = {}): PreparedTxRecord => ({
  action: 'BET',
  txBytesHash: TX_HASH,
  expiresAt: NOW + PREPARE_TX_TTL_MS / 2,
  betId: basePrepareParams.betId,
  userId: basePrepareParams.userId,
  ...overrides,
});

describe('SuiService', () => {
  let nonceStore: NonceStore;
  let suiService: SuiService;
  let sponsorMock: {
    toSuiAddress: () => string;
    signTransaction: (bytes: Uint8Array) => Promise<{ signature: string }>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();

    sponsorMock = {
      toSuiAddress: vi.fn().mockReturnValue('0xsponsor'),
      signTransaction: vi.fn().mockResolvedValue({ signature: 'sponsor-signature' }),
    };
    mockGetSponsorKeypair.mockReturnValue(sponsorMock);

    mockBuildPlaceBetTx.mockReturnValue({
      setGasPayment: vi.fn(),
      setGasBudget: vi.fn(),
      setGasOwner: vi.fn(),
      build: vi.fn().mockResolvedValue(TX_BYTES),
    });

    mockGetGasPayment.mockResolvedValue({
      gasPayment: [{ objectId: 'gas', version: '1', digest: 'd' }],
      gasBudget: 50_000_000,
      gasPrice: 1000,
    });

    mockDryRunTransactionBlock.mockResolvedValue({ effects: { status: { status: 'success' } } });
    mockExecuteTransactionBlock.mockResolvedValue({ digest: '0xdigest' });
    mockGetTransactionBlock.mockResolvedValue({ effects: { status: { status: 'success' } } });
    mockSleep.mockResolvedValue(undefined);

    nonceStore = {
      save: vi.fn(),
      consume: vi.fn(),
    };

    suiService = new SuiService(nonceStore);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('prepareBetTransaction builds, dry-runs, and stores nonce', async () => {
    const result = await suiService.prepareBetTransaction(basePrepareParams);

    expect(mockBuildPlaceBetTx).toHaveBeenCalledWith({
      userAddress: basePrepareParams.userAddress,
      poolId: basePrepareParams.poolId,
      prediction: basePrepareParams.prediction,
      userDelCoinId: basePrepareParams.userDelCoinId,
    });
    expect(mockDryRunTransactionBlock).toHaveBeenCalledWith({ transactionBlock: TX_BYTES });
    expect(nonceStore.save).toHaveBeenCalledWith(
      result.nonce,
      {
        action: 'BET',
        txBytesHash: TX_HASH,
        expiresAt: NOW + PREPARE_TX_TTL_MS,
        betId: basePrepareParams.betId,
        userId: basePrepareParams.userId,
      },
      PREPARE_TX_TTL_SECONDS,
    );
    expect(result.txBytes).toBe(TX_BYTES_BASE64);
    expect(result.expiresAt).toBe(NOW + PREPARE_TX_TTL_MS);
  });

  it('prepareBetTransaction fails when sponsor key is missing', async () => {
    mockGetSponsorKeypair.mockImplementation(() => {
      throw new Error('missing');
    });

    await expect(suiService.prepareBetTransaction(basePrepareParams)).rejects.toMatchObject({
      code: 'ENV_MISSING',
    });
  });

  it('prepareBetTransaction fails when no gas coins available', async () => {
    mockGetGasPayment.mockRejectedValue(new Error('no gas'));

    await expect(suiService.prepareBetTransaction(basePrepareParams)).rejects.toMatchObject({
      code: 'NO_GAS_COINS',
    });
  });

  it('prepareBetTransaction propagates dry-run failure', async () => {
    mockDryRunTransactionBlock.mockResolvedValue({
      effects: { status: { status: 'failure', error: 'balance too low' } },
    });

    await expect(suiService.prepareBetTransaction(basePrepareParams)).rejects.toMatchObject({
      code: 'SUI_DRY_RUN_FAILED',
    });
  });

  it('executeBetTransaction succeeds when prepared data matches', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord());
    mockGetTransactionBlock.mockResolvedValue({
      effects: { status: { status: 'success' } },
      objectChanges: [
        {
          type: 'created',
          objectType: '0x123::betting::Bet',
          objectId: '0xbet',
        },
      ],
    });

    const result = await suiService.executeBetTransaction(baseExecuteParams);

    expect(mockExecuteTransactionBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionBlock: expect.any(Uint8Array),
        signature: [baseExecuteParams.userSignature, 'sponsor-signature'],
        requestType: 'WaitForLocalExecution',
      }),
    );
    expect(mockGetTransactionBlock).toHaveBeenCalledWith({
      digest: '0xdigest',
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });
    expect(result.digest).toBe('0xdigest');
    expect(result.betObjectId).toBe('0xbet');
  });

  it('executeBetTransaction rejects when nonce is missing', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(null);

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'INVALID_NONCE',
    });
  });

  it('executeBetTransaction rejects on tx hash mismatch', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord({ txBytesHash: 'other' }));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'TX_MISMATCH',
    });
  });

  it('executeBetTransaction rejects when nonce expired', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord({ expiresAt: NOW - 1 }));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'NONCE_EXPIRED',
    });
  });

  it('executeBetTransaction rejects when bet/user mismatch', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord({ betId: 'other' }));
    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'BET_MISMATCH',
    });

    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord({ userId: 'other' }));
    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'USER_MISMATCH',
    });
  });

  it('executeBetTransaction categorizes rate limit errors', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord());
    mockExecuteTransactionBlock.mockRejectedValue(new Error('429 rate limit'));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_EXECUTE_FAILED',
      details: expect.objectContaining({ category: 'rate_limit' }),
    });
  });

  it('executeBetTransaction categorizes timeout errors', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord());
    mockExecuteTransactionBlock.mockRejectedValue(new Error('rpc timeout'));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_EXECUTE_FAILED',
      details: expect.objectContaining({ category: 'timeout' }),
    });
  });

  it('executeBetTransaction fails when digest is missing', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord());
    mockExecuteTransactionBlock.mockResolvedValue({});

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_EXECUTE_FAILED',
    });
  });

  it('ensureOnChain retries and fails after max attempts', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord());
    mockGetTransactionBlock.mockRejectedValue(new Error('not found'));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_TX_NOT_FOUND',
    });
    expect(mockGetTransactionBlock).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(3);
  });

  it('ensureOnChain propagates on-chain failure status', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord());
    mockGetTransactionBlock.mockResolvedValue({
      effects: { status: { status: 'failure', error: 'reverted' } },
    });

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_EXECUTE_FAILED',
    });
  });

  it('throws BusinessRuleError when executeTransactionBlock throws non-rate/timeout', async () => {
    (nonceStore.consume as Mock).mockResolvedValue(createPreparedRecord());
    mockExecuteTransactionBlock.mockRejectedValue(new Error('rpc other'));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  describe('getDelBalance', () => {
    beforeEach(() => {
      process.env.SUI_PACKAGE_ID = '0xtest';
    });

    afterEach(() => {
      delete process.env.SUI_PACKAGE_ID;
    });

    it('returns DEL balance in DEL units (converted from MIST)', async () => {
      const address = '0x123';
      const mistBalance = '5000000000'; // 5 DEL in MIST (5 * 10^9)
      mockGetCoins.mockResolvedValue({
        data: [{ balance: mistBalance, coinType: '0x0::del::DEL' }],
        nextCursor: null,
        hasNextPage: false,
      });

      const balance = await suiService.getDelBalance(address);

      expect(mockGetCoins).toHaveBeenCalledWith({
        owner: address,
        coinType: '0x0::del::DEL',
        cursor: undefined,
        limit: 50,
      });
      expect(balance).toBe(5);
    });

    it('throws SUI_GET_BALANCE_FAILED when getCoins fails', async () => {
      process.env.SUI_PACKAGE_ID = '0xtest';
      mockGetCoins.mockRejectedValue(new Error('RPC error'));

      await expect(suiService.getDelBalance('0x123')).rejects.toThrow();
    });

    it('handles zero balance correctly', async () => {
      const address = '0x123';
      mockGetCoins.mockResolvedValue({
        data: [],
        nextCursor: null,
        hasNextPage: false,
      });

      const balance = await suiService.getDelBalance(address);

      expect(balance).toBe(0);
    });
  });
});
