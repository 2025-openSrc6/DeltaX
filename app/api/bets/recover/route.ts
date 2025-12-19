import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { registry } from '@/lib/registry';
import { z } from 'zod';

const recoverBetSchema = z.object({
  betId: z.string().uuid('betId must be a valid UUID'),
  txDigest: z.string().optional(),
});

/**
 * POST /api/bets/recover
 *
 * 운영자/크론 전용(현 스코프): 체인 성공, DB 실패로 인해 betObjectId 등이 누락된 케이스를 수동 복구한다.
 * - 체인 재실행 없음. tx 조회 + DB 보정만 수행.
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    const body = await request.json();
    const { betId, txDigest } = recoverBetSchema.parse(body);

    const result = await registry.betService.recoverBetFromTxDigest({
      betId,
      txDigest,
    });

    cronLogger.info('[Bet Recover] completed', { betId, durationMs: Date.now() - startedAt });
    return createSuccessResponse(result);
  } catch (error) {
    cronLogger.error('[Bet Recover] failed', {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
