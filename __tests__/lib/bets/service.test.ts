import { BetService } from '@/lib/bets/service';
import type { Bet } from '@/db/schema/bets';
import type { Round } from '@/db/schema/rounds';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/shared/errors';
import * as uuidModule from '@/lib/shared/uuid';
import { describe, beforeEach, it, expect, vi } from 'vitest';

const ROUND_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BET_ID = '33333333-3333-4333-8333-333333333333';

const baseTime = new Date('2024-01-01T00:00:00Z');

const createRound = (overrides: Partial<Round> = {}): Round => ({
  id: ROUND_ID,
  roundNumber: 1,
  type: '6HOUR',
  status: 'BETTING_OPEN',
  startTime: baseTime.getTime() - 60_000,
  endTime: baseTime.getTime() + 6 * 60 * 60 * 1000,
  lockTime: baseTime.getTime() + 30_000,
  totalPool: 0,
  totalGoldBets: 0,
  totalBtcBets: 0,
  totalBetsCount: 0,
  platformFeeRate: '0.05',
  platformFeeCollected: 0,
  payoutPool: 0,
  createdAt: baseTime.getTime() - 1_000,
  updatedAt: baseTime.getTime() - 1_000,
  goldStartPrice: null,
  goldEndPrice: null,
  btcStartPrice: null,
  btcEndPrice: null,
  startPriceSource: null,
  startPriceIsFallback: false,
  startPriceFallbackReason: null,
  endPriceSource: null,
  endPriceIsFallback: false,
  endPriceFallbackReason: null,
  priceSnapshotStartAt: null,
  priceSnapshotEndAt: null,
  goldChangePercent: null,
  btcChangePercent: null,
  winner: null,
  suiPoolAddress: 'pool-1',
  suiSettlementObjectId: null,
  bettingOpenedAt: null,
  bettingLockedAt: null,
  roundEndedAt: null,
  settlementCompletedAt: null,
  settlementFailureAlertSentAt: null,
  ...overrides,
});

const createBet = (overrides: Partial<Bet> = {}): Bet => ({
  id: BET_ID,
  roundId: ROUND_ID,
  userId: USER_ID,
  prediction: 'GOLD',
  amount: 1_000,
  currency: 'DEL',
  resultStatus: 'PENDING',
  settlementStatus: 'PENDING',
  payoutAmount: 0,
  chainStatus: 'PENDING',
  createdAt: baseTime.getTime(),
  processedAt: baseTime.getTime(),
  suiBetObjectId: null,
  suiTxHash: null,
  suiPayoutTxHash: null,
  suiTxTimestamp: null,
  suiPayoutTimestamp: null,
  settledAt: null,
  ...overrides,
});

describe('BetService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let betRepository: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roundRepository: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let suiService: any;
  let service: BetService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);

    betRepository = {
      createPending: vi.fn(),
      findById: vi.fn(),
      finalizeExecution: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateById: vi.fn(),
      findByRoundId: vi.fn(),
    };

    roundRepository = {
      findById: vi.fn(),
    };

    suiService = {
      prepareBetTransaction: vi.fn(),
      executeBetTransaction: vi.fn(),
    };

    service = new BetService(betRepository, roundRepository, suiService);
    vi.spyOn(uuidModule, 'generateUUID').mockReturnValue(BET_ID);
  });

  describe('createBetWithSuiPrepare', () => {
    it('creates pending bet and returns prepare result with betId', async () => {
      const round = createRound();
      roundRepository.findById.mockResolvedValue(round);
      betRepository.createPending.mockResolvedValue(createBet());
      suiService.prepareBetTransaction.mockResolvedValue({
        txBytes: 'tx-bytes',
        nonce: 'nonce-1',
        expiresAt: baseTime.getTime() + 60_000,
      });

      const result = await service.createBetWithSuiPrepare(
        {
          roundId: round.id,
          prediction: 'GOLD',
          amount: 1_000,
          userAddress: '0xabc123',
          userDelCoinId: '0xdef456',
        },
        USER_ID,
      );

      expect(betRepository.createPending).toHaveBeenCalledWith({
        id: BET_ID,
        roundId: ROUND_ID,
        userId: USER_ID,
        prediction: 'GOLD',
        amount: 1_000,
        createdAt: baseTime.getTime(),
      });
      expect(suiService.prepareBetTransaction).toHaveBeenCalledWith({
        userAddress: '0xabc123',
        userDelCoinId: '0xdef456',
        poolId: 'pool-1',
        prediction: 1,
        betId: BET_ID,
        userId: USER_ID,
      });
      expect(result).toEqual({
        txBytes: 'tx-bytes',
        nonce: 'nonce-1',
        expiresAt: baseTime.getTime() + 60_000,
        betId: BET_ID,
      });
    });

    it('throws when round does not exist', async () => {
      roundRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.createBetWithSuiPrepare(
          {
            roundId: ROUND_ID,
            prediction: 'GOLD',
            amount: 1_000,
            userAddress: '0xabc123',
            userDelCoinId: '0xdef456',
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws when pool id is missing on round', async () => {
      roundRepository.findById.mockResolvedValue(createRound({ suiPoolAddress: null }));

      await expect(
        service.createBetWithSuiPrepare(
          {
            roundId: ROUND_ID,
            prediction: 'GOLD',
            amount: 1_000,
            userAddress: '0xabc123',
            userDelCoinId: '0xdef456',
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws when round is not open', async () => {
      roundRepository.findById.mockResolvedValue(createRound({ status: 'BETTING_LOCKED' }));

      await expect(
        service.createBetWithSuiPrepare(
          {
            roundId: ROUND_ID,
            prediction: 'GOLD',
            amount: 1_000,
            userAddress: '0xabc123',
            userDelCoinId: '0xdef456',
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('throws when lock time has passed', async () => {
      roundRepository.findById.mockResolvedValue(createRound({ lockTime: baseTime.getTime() - 1 }));

      await expect(
        service.createBetWithSuiPrepare(
          {
            roundId: ROUND_ID,
            prediction: 'GOLD',
            amount: 1_000,
            userAddress: '0xabc123',
            userDelCoinId: '0xdef456',
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('translates duplicate bet error to BusinessRuleError', async () => {
      const err = new Error('duplicate');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err as any).code = 'ALREADY_EXISTS';
      roundRepository.findById.mockResolvedValue(createRound());
      betRepository.createPending.mockRejectedValue(err);

      await expect(
        service.createBetWithSuiPrepare(
          {
            roundId: ROUND_ID,
            prediction: 'GOLD',
            amount: 1_000,
            userAddress: '0xabc123',
            userDelCoinId: '0xdef456',
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });
  });

  describe('executeBetWithUpdate', () => {
    it('executes bet on chain then finalizes', async () => {
      betRepository.findById.mockResolvedValue(createBet());
      suiService.executeBetTransaction.mockResolvedValue({ digest: 'tx-digest' });

      const result = await service.executeBetWithUpdate({
        txBytes: 'dGVzdA==',
        userSignature: 'sig',
        nonce: 'nonce-1234',
        betId: BET_ID,
        userId: USER_ID,
      });

      expect(suiService.executeBetTransaction).toHaveBeenCalledWith({
        txBytes: 'dGVzdA==',
        userSignature: 'sig',
        nonce: 'nonce-1234',
        betId: BET_ID,
        userId: USER_ID,
      });
      expect(betRepository.finalizeExecution).toHaveBeenCalledWith({
        betId: BET_ID,
        roundId: ROUND_ID,
        userId: USER_ID,
        prediction: 'GOLD',
        amount: 1_000,
        suiTxHash: 'tx-digest',
      });
      expect(result).toEqual({ digest: 'tx-digest' });
    });

    it('returns early when bet already executed', async () => {
      betRepository.findById.mockResolvedValue(
        createBet({ chainStatus: 'EXECUTED', suiTxHash: 'existing' }),
      );

      const result = await service.executeBetWithUpdate({
        txBytes: 'dGVzdA==',
        userSignature: 'sig',
        nonce: 'nonce-1234',
        betId: BET_ID,
        userId: USER_ID,
      });

      expect(suiService.executeBetTransaction).not.toHaveBeenCalled();
      expect(betRepository.finalizeExecution).not.toHaveBeenCalled();
      expect(result).toEqual({ digest: 'existing', betObjectId: 'unknown' });
    });

    it('throws when bet not found', async () => {
      betRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.executeBetWithUpdate({
          txBytes: 'dGVzdA==',
          userSignature: 'sig',
          nonce: 'nonce-1234',
          betId: BET_ID,
          userId: USER_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws when user id mismatches', async () => {
      betRepository.findById.mockResolvedValue(createBet({ userId: USER_ID }));

      await expect(
        service.executeBetWithUpdate({
          txBytes: 'dGVzdA==',
          userSignature: 'sig',
          nonce: 'nonce-1234',
          betId: BET_ID,
          userId: '44444444-4444-4444-8444-444444444444',
        }),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });
  });

  describe('getBets', () => {
    it('returns bets with pagination meta', async () => {
      betRepository.findMany.mockResolvedValue([createBet()]);
      betRepository.count.mockResolvedValue(3);

      const result = await service.getBets({
        page: 1,
        pageSize: 2,
        roundId: ROUND_ID,
        userId: USER_ID,
        prediction: 'GOLD',
        sort: 'amount',
        order: 'asc',
      });

      expect(betRepository.findMany).toHaveBeenCalledWith({
        filters: {
          roundId: ROUND_ID,
          userId: USER_ID,
          prediction: 'GOLD',
          resultStatus: undefined,
          settlementStatus: undefined,
        },
        sort: 'amount',
        order: 'asc',
        limit: 2,
        offset: 0,
      });
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      });
      expect(result.bets).toHaveLength(1);
    });

    it('throws on invalid query params', async () => {
      await expect(
        service.getBets({
          page: 0,
          pageSize: 10,
        }),
      ).rejects.toThrow();
    });
  });

  describe('getBetById', () => {
    it('returns bet with round info', async () => {
      betRepository.findById.mockResolvedValue(createBet());
      roundRepository.findById.mockResolvedValue(createRound());

      const result = await service.getBetById('550e8400-e29b-41d4-a716-446655440000');

      expect(result.round).toEqual({
        id: ROUND_ID,
        roundNumber: 1,
        type: '6HOUR',
        status: 'BETTING_OPEN',
        startTime: baseTime.getTime() - 60_000,
        endTime: baseTime.getTime() + 6 * 60 * 60 * 1000,
      });
    });

    it('throws on invalid uuid', async () => {
      await expect(service.getBetById('not-a-uuid')).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws when bet is missing', async () => {
      betRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.getBetById('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws when related round is missing', async () => {
      betRepository.findById.mockResolvedValue(createBet());
      roundRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.getBetById('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('updateBet and settlement helpers', () => {
    it('delegates updateBet to repository', async () => {
      betRepository.updateById.mockResolvedValue(createBet({ amount: 2_000 }));

      const result = await service.updateBet(BET_ID, { amount: 2_000 });

      expect(betRepository.updateById).toHaveBeenCalledWith(BET_ID, { amount: 2_000 });
      expect(result.amount).toBe(2_000);
    });

    it('updates settlement fields and sets settledAt', async () => {
      const updated = createBet({
        resultStatus: 'WON',
        settlementStatus: 'COMPLETED',
        payoutAmount: 3_000,
        settledAt: baseTime.getTime(),
      });
      betRepository.updateById.mockResolvedValue(updated);

      const result = await service.updateBetSettlement(BET_ID, {
        resultStatus: 'WON',
        settlementStatus: 'COMPLETED',
        payoutAmount: 3_000,
      });

      expect(betRepository.updateById).toHaveBeenCalledWith(BET_ID, {
        resultStatus: 'WON',
        settlementStatus: 'COMPLETED',
        payoutAmount: 3_000,
        settledAt: baseTime.getTime(),
      });
      expect(result).toEqual(updated);
    });

    it('finds bets by round id', async () => {
      betRepository.findByRoundId.mockResolvedValue([createBet()]);

      const result = await service.findBetsByRoundId(ROUND_ID);

      expect(betRepository.findByRoundId).toHaveBeenCalledWith(ROUND_ID);
      expect(result).toHaveLength(1);
    });
  });
});
