import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * POST /api/bets/claim/prepare
 *
 * A안: betObjectId는 서버(DB)에서 확보한다.
 *
 * Request Body:
 * { betId: "<uuid>" }
 *
 * Response:
 * { success: true, data: { txBytes, nonce, expiresAt } }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body = await request.json();

    const result = await registry.betService.prepareClaimWithSuiPrepare(
      body,
      session.userId,
      session.suiAddress,
    );
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
