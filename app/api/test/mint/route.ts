import { NextRequest } from 'next/server';
import { mintDel } from '@/lib/sui/admin';
import { createSuccessResponse, handleApiError, createErrorResponse } from '@/lib/shared/response';

/**
 * POST /api/test/mint
 *
 * 개발/테스트용 DEL 코인 민팅 API
 * - 운영 환경에서는 비활성화 필수
 */
export async function POST(request: NextRequest) {
  // Production guard (just in case)
  if (process.env.NODE_ENV === 'production') {
    return createErrorResponse(404, 'NOT_FOUND', 'Not available in production');
  }

  try {
    const body = await request.json();
    const { address, amount } = body;

    if (!address || typeof address !== 'string') {
      return createErrorResponse(400, 'INVALID_INPUT', 'address is required');
    }

    // 기본값 100, 최대 1_000_000
    const mintAmount = typeof amount === 'number' ? amount : 100;
    if (mintAmount > 1_000_000) {
      return createErrorResponse(400, 'INVALID_INPUT', 'Max mint amount is 1_000_000');
    }

    const result = await mintDel(address, mintAmount);

    return createSuccessResponse({
      address,
      amount: mintAmount,
      txDigest: result.txDigest,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
