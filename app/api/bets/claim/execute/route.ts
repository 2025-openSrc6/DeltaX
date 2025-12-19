import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * POST /api/bets/claim/execute
 *
 * Prepare에서 받은 txBytes + userSignature + nonce + betId를 받아 claim_payout을 실행한다.
 *
 * Request Body:
 * { betId, txBytes, userSignature, nonce }
 *
 * Response:
 * { success: true, data: { digest, payoutAmount } }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body = await request.json();

    const result = await registry.betService.executeClaimWithUpdate(body, session.userId);
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
