import { RoundService } from '@/lib/rounds/service';
import { describe, it, expect } from 'vitest';
import type { RoundRepository } from '@/lib/rounds/repository';
import type { BetService } from '@/lib/bets/service';

describe('RoundService.recoveryRounds (Job 6 deferred)', () => {
  it('결정 B(2025-12-15): claim 모델 전환 중이라 noop 결과를 반환한다', async () => {
    const roundService = new RoundService(
      {} as unknown as RoundRepository,
      {} as unknown as BetService,
    );
    const result = await roundService.recoveryRounds();
    expect(result).toEqual({ stuckCount: 0, retriedCount: 0, alertedCount: 0 });
  });
});
