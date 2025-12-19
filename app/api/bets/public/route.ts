import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponseWithMeta, handleApiError } from '@/lib/shared/response';
import { ValidationError } from '@/lib/shared/errors';

/**
 * GET /api/bets/public
 *
 * 홈 공개 피드 (인증 불필요)
 * - 서버를 통해 생성/체결된 bets(D1 인덱스)만 노출
 * - 주소는 마스킹하여 반환
 *
 * Query:
 * - roundId?: uuid
 * - prediction?: GOLD|BTC
 * - resultStatus?: string
 * - settlementStatus?: string
 * - page, pageSize, sort, order
 */
export async function GET(request: NextRequest) {
  try {
    const params = parseQueryParams(request);
    if (params.userId) {
      throw new ValidationError('userId filter is not allowed on public feed');
    }

    const result = await registry.betService.getPublicBets(params);
    return createSuccessResponseWithMeta(result.bets, result.meta);
  } catch (error) {
    return handleApiError(error);
  }
}

function parseQueryParams(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  return {
    roundId: searchParams.get('roundId') ?? undefined,
    // guard: reject via ValidationError above if userId is provided
    userId: searchParams.get('userId') ?? undefined,
    prediction: searchParams.get('prediction') ?? undefined,
    resultStatus: searchParams.get('resultStatus') ?? undefined,
    settlementStatus: searchParams.get('settlementStatus') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    order: searchParams.get('order') ?? undefined,
  };
}
