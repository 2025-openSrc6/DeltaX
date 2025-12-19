import { RoundService } from '@/lib/rounds/service';
import { describe, it, expect } from 'vitest';
import type { RoundRepository } from '@/lib/rounds/repository';
import type { BetService } from '@/lib/bets/service';

describe('RoundService.settleRound (Job 5 deprecated)', () => {
  it('결정 B(2025-12-15): Job 5는 폐기되었으므로 DEPRECATED_JOB 에러를 던진다', async () => {
    const roundService = new RoundService(
      {} as unknown as RoundRepository,
      {} as unknown as BetService,
    );
    await expect(roundService.settleRound('round-id')).rejects.toMatchObject({
      code: 'DEPRECATED_JOB',
    });
  });
});
