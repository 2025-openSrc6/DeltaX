import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { createErrorResponse, handleApiError } from '@/lib/shared/response';
import { ValidationError } from '@/lib/shared/errors';
import { NextRequest } from 'next/server';

/**
 * POST /api/cron/rounds/settle
 *
 * Job 5: Settlement Processor
 *
 * 결정 B(2025-12-15): Job 5(서버 배당/정산) 폐기.
 * - 배당은 유저 Claim(prepare/execute + claim_payout) 모델로 수행한다.
 * - 따라서 이 엔드포인트는 더 이상 사용하지 않는다.
 *
 * @example
 * // Recovery에서
 * POST /api/cron/rounds/settle
 * Body: { roundId: "uuid-here" }
 * Header: X-Cron-Secret: xxx
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 5] Auth failed');
      return authResult.response;
    }

    // 2. Body 파싱
    const body = await request.json();
    const { roundId } = body;

    if (!roundId || typeof roundId !== 'string') {
      throw new ValidationError('roundId is required', { roundId });
    }

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.warn('[Job 5] Deprecated endpoint called', { roundId, durationMs: jobDuration });
    return createErrorResponse(
      410,
      'DEPRECATED_JOB',
      'Job 5 is deprecated. Use user claim model (prepare/execute + claim_payout).',
      { roundId },
    );
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 5] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });

    // TODO: Slack 알림 (CRITICAL - 돈이 걸린 Job)
    return handleApiError(error);
  }
}
