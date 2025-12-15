import { RoundService } from '@/lib/rounds/service';
import { describe, it, expect, vi } from 'vitest';
import type { RoundRepository } from '@/lib/rounds/repository';
import type { BetService } from '@/lib/bets/service';

vi.mock('@/lib/sui/recovery', () => ({
  fetchTransactionBlockForRecovery: vi
    .fn()
    .mockResolvedValue({ effects: { status: { status: 'success' } } }),
  parseCreatedPoolIdFromTx: vi.fn().mockReturnValue(null),
  parseCreatedSettlementIdFromTx: vi.fn().mockReturnValue(null),
  parseCreatedFeeCoinIdFromTx: vi.fn().mockReturnValue(null),
}));

describe('RoundService.recoveryRounds (Job 6 safe backfill)', () => {
  it('runs safe backfill and returns counts', async () => {
    const roundRepository = {
      findRoundsMissingPoolAddressWithCreateDigest: vi.fn().mockResolvedValue([]),
      findRoundsMissingFinalizeArtifactsWithFinalizeDigest: vi.fn().mockResolvedValue([]),
    } as unknown as RoundRepository;

    const betService = {
      backfillMissingBetObjectIds: vi.fn().mockResolvedValue({ scanned: 0, updated: 0 }),
      backfillMissingClaimFinalizes: vi.fn().mockResolvedValue({ scanned: 0, updated: 0 }),
    } as unknown as BetService;

    const roundService = new RoundService(roundRepository, betService);
    const result = await roundService.recoveryRounds();

    expect(result.stuckCount).toBe(0);
    expect(result.retriedCount).toBe(0);
    expect(result.alertedCount).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).roundBackfill).toEqual({
      poolScanned: 0,
      poolUpdated: 0,
      finalizeScanned: 0,
      finalizeUpdated: 0,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).betBackfill).toEqual({
      betObjectIdScanned: 0,
      betObjectIdUpdated: 0,
      claimScanned: 0,
      claimUpdated: 0,
    });
  });
});
