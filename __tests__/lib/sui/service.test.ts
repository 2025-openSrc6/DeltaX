import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import { SuiService } from '@/lib/sui/service';
import { PREPARE_TX_TTL_MS, PREPARE_TX_TTL_SECONDS } from '@/lib/sui/constants';
import type { NonceStore, PreparedTxRecord } from '@/lib/sui/nonceStore';
import type { BetService } from '@/lib/bets/service';

const {
  mockGetSponsorKeypair,
  mockDryRunTransactionBlock,
  mockExecuteTransactionBlock,
  mockGetTransactionBlock,
  mockGetGasPayment,
  mockBuildPlaceBetTx,
  mockSleep,
} = vi.hoisted(() => ({
  mockGetSponsorKeypair: vi.fn(),
  mockDryRunTransactionBlock: vi.fn(),
  mockExecuteTransactionBlock: vi.fn(),
  mockGetTransactionBlock: vi.fn(),
  mockGetGasPayment: vi.fn(),
  mockBuildPlaceBetTx: vi.fn(),
  mockSleep: vi.fn(),
}));

vi.mock('@/lib/sui/client', () => ({
  getSponsorKeypair: mockGetSponsorKeypair,
  suiClient: {
    dryRunTransactionBlock: mockDryRunTransactionBlock,
    executeTransactionBlock: mockExecuteTransactionBlock,
    getTransactionBlock: mockGetTransactionBlock,
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

const TX_BYTES = new Uint8Array([1, 2, 3]);
const TX_BYTES_BASE64 = Buffer.from(TX_BYTES).toString('base64');
const TX_HASH = crypto.createHash('sha256').update(TX_BYTES).digest('hex');
const NOW = new Date('2025-01-01T00:00:00Z').getTime();
const NONCE = '00000000-0000-0000-0000-000000000000';

const basePrepareParams = {
  userAddress: '0x1a2b3c4d',
  poolId: '0x5e6f7a8b',
  prediction: 1,
  userDelCoinId: '0x9c0d1e2f',
  betId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
};

const baseExecuteParams = {
  txBytes: TX_BYTES_BASE64,
  userSignature: 'dXNlci1zaWduYXR1cmU=', // 'user-signature' base64
  nonce: NONCE,
  betId: basePrepareParams.betId,
  userId: basePrepareParams.userId,
};

const createPreparedRecord = (overrides: Partial<PreparedTxRecord> = {}): PreparedTxRecord => ({
  txBytesHash: TX_HASH,
  expiresAt: NOW + PREPARE_TX_TTL_MS / 2,
  betId: basePrepareParams.betId,
  userId: basePrepareParams.userId,
  ...overrides,
});

describe('SuiService', () => {
  let nonceStore: NonceStore;
  let betService: BetService;
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

    betService = {
      updateBet: vi.fn(),
    } as unknown as BetService;

    suiService = new SuiService(betService, nonceStore);
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

  it('executeBetTransaction succeeds and updates bet', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord());

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
      options: { showEffects: true },
    });
    expect(betService.updateBet).toHaveBeenCalledWith(baseExecuteParams.betId, {
      suiTxHash: '0xdigest',
      processedAt: NOW,
    });
    expect(result.digest).toBe('0xdigest');
  });

  it('executeBetTransaction rejects when nonce is missing', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(null);

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'INVALID_NONCE',
    });
  });

  it('executeBetTransaction rejects on tx hash mismatch', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord({ txBytesHash: 'other' }));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'TX_MISMATCH',
    });
  });

  it('executeBetTransaction rejects when nonce expired', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord({ expiresAt: NOW - 1 }));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'NONCE_EXPIRED',
    });
  });

  it('executeBetTransaction rejects when bet/user mismatch', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord({ betId: 'other' }));
    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'BET_MISMATCH',
    });

    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord({ userId: 'other' }));
    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'USER_MISMATCH',
    });
  });

  it('executeBetTransaction categorizes rate limit errors', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord());
    mockExecuteTransactionBlock.mockRejectedValue(new Error('429 rate limit'));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_EXECUTE_FAILED',
      details: expect.objectContaining({ category: 'rate_limit' }),
    });
  });

  it('executeBetTransaction categorizes timeout errors', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord());
    mockExecuteTransactionBlock.mockRejectedValue(new Error('rpc timeout'));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_EXECUTE_FAILED',
      details: expect.objectContaining({ category: 'timeout' }),
    });
  });

  it('executeBetTransaction fails when digest is missing', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord());
    mockExecuteTransactionBlock.mockResolvedValue({});

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_EXECUTE_FAILED',
    });
  });

  it('ensureOnChain retries and fails after max attempts', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord());
    mockGetTransactionBlock.mockRejectedValue(new Error('not found'));

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_TX_NOT_FOUND',
    });
    expect(mockGetTransactionBlock).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(3);
  });

  it('ensureOnChain propagates on-chain failure status', async () => {
    nonceStore.consume = vi.fn().mockResolvedValue(createPreparedRecord());
    mockGetTransactionBlock.mockResolvedValue({
      effects: { status: { status: 'failure', error: 'reverted' } },
    });

    await expect(suiService.executeBetTransaction(baseExecuteParams)).rejects.toMatchObject({
      code: 'SUI_EXECUTE_FAILED',
    });
  });
});
