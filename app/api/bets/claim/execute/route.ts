import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { UnauthorizedError } from '@/lib/shared/errors';

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
    const body = await request.json();

    const suiAddress = request.cookies.get('suiAddress')?.value;
    if (!suiAddress) {
      throw new UnauthorizedError('Login required');
    }

    const user = await registry.userRepository.findBySuiAddress(suiAddress);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const result = await registry.betService.executeClaimWithUpdate(body, user.id);
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
