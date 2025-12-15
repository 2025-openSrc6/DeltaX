import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { UnauthorizedError } from '@/lib/shared/errors';

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
    const body = await request.json();

    const suiAddress = request.cookies.get('suiAddress')?.value;
    if (!suiAddress) {
      throw new UnauthorizedError('Login required');
    }

    const user = await registry.userRepository.findBySuiAddress(suiAddress);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const result = await registry.betService.prepareClaimWithSuiPrepare(body, user.id, suiAddress);
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
