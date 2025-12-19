import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { registry } from '@/lib/registry';
import { z } from 'zod';

const recoverClaimSchema = z.object({
  betId: z.string().uuid('betId must be a valid UUID'),
  txDigest: z.string().optional(),
});

/**
 * POST /api/bets/claim/recover
 *
 * 운영자/크론 전용(현 스코프): claim tx는 성공했는데 DB 반영이 실패한 케이스를 수동 복구한다.
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
    const { betId, txDigest } = recoverClaimSchema.parse(body);

    const result = await registry.betService.recoverClaimFromTxDigest({
      betId,
      txDigest,
    });

    cronLogger.info('[Claim Recover] completed', { betId, durationMs: Date.now() - startedAt });
    return createSuccessResponse(result);
  } catch (error) {
    cronLogger.error('[Claim Recover] failed', {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
