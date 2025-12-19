import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponseWithMeta, handleApiError } from '@/lib/shared/response';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * GET /api/me/bets
 *
 * 내 베팅 목록 (인증 필수)
 * - userId는 세션에서 결정한다.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const params = parseQueryParams(request);

    const result = await registry.betService.getMyBets(params, session.userId);
    return createSuccessResponseWithMeta(result.bets, result.meta);
  } catch (error) {
    return handleApiError(error);
  }
}

function parseQueryParams(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  return {
    roundId: searchParams.get('roundId') ?? undefined,
    prediction: searchParams.get('prediction') ?? undefined,
    resultStatus: searchParams.get('resultStatus') ?? undefined,
    settlementStatus: searchParams.get('settlementStatus') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    order: searchParams.get('order') ?? undefined,
  };
}
