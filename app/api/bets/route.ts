import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import {
  createSuccessResponse,
  createSuccessResponseWithMeta,
  handleApiError,
} from '@/lib/shared/response';
import { UnauthorizedError } from '@/lib/shared/errors';

/**
 * POST /api/bets
 *
 * 베팅을 생성합니다.
 * 유저가 특정 라운드에 대해 GOLD 또는 BTC 예측을 하고 금액을 베팅합니다.
 *
 * 베팅용 PTB를 서버에서 빌드한 뒤, base64 txBytes + nonce + expiresAt을 반환합니다.
 * - 입력 검증/가스 세팅/dry-run은 Service에서 처리.
 * - nonce/txBytes 해시는 Upstash Redis에 TTL로 저장해 실행 단계에서 재사용/변조 방지.
 *
 * Request Body:
 * {
 *   roundId: string;          // 베팅할 라운드 ID (필수)
 *   prediction: 'GOLD' | 'BTC'; // 예측 방향 (필수)
 *   amount: number;           // 베팅 금액 (필수, 최소 100)
 *   userAddress: string;      // 유저 Sui address (필수)
 *   userDelCoinId: string;    // 유저-소유 DEL Coin object id (필수)
 * }
 *
 * Response (준비 성공):
 * {
 *   success: true,
 *   data: {
 *     betId: "<uuid>",
 *     txBytes: "<base64>",
 *     nonce: "<uuid>",
 *     expiresAt: <ms epoch>
 *   }
 * }
 *
 * 에러 Response:
 * - 400 Bad Request: 입력값 검증 실패, 베팅 마감됨, 잔액 부족
 * - 404 Not Found: 라운드 없음
 * - 500 Internal Server Error: 서버 에러
 *
 * 프로세스:
 * 1. 요청 본문 파싱
 * 2. 유저 인증 (현재는 Mock ID 사용)
 * 3. Service 호출 (검증 및 트랜잭션 처리)
 * 4. 결과 응답
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Request Body 파싱
    const body = await request.json();

    // 2. 유저 인증 및 검증
    const suiAddress = request.cookies.get('suiAddress')?.value;
    if (!suiAddress) {
      throw new UnauthorizedError('Login required');
    }

    // TODO(ehdnd): 유저 auth 로직 추가

    // TODO(ehdnd): 서비스 레이어 제작 요청
    const user = await registry.userRepository.findBySuiAddress(suiAddress);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const userId = user.id;

    // 3. Service 호출
    // - 라운드 상태 검증 (OPEN)
    // - 시간 검증 (Lock Time 이전)
    // - 잔액 검증
    // - 베팅 생성 및 풀 업데이트 (Atomic Batch)
    const result = await registry.betService.createBetWithSuiPrepare(body, userId);

    // 4. 성공 응답 반환 (betId 포함)
    return createSuccessResponse(result);
  } catch (error) {
    // 5. 에러 처리 (Service 에러 → HTTP 응답)
    return handleApiError(error);
  }
}

/**
 * GET /api/bets
 *
 * 베팅 목록을 조회합니다. 다양한 필터링과 정렬, 페이지네이션을 지원합니다.
 *
 * Query Parameters:
 * - roundId: 특정 라운드의 베팅만 조회
 * - userId: 특정 유저의 베팅만 조회
 * - prediction: 'GOLD' | 'BTC' 필터링
 * - resultStatus: 'WON' | 'LOST' | 'PENDING' 등 결과 상태 필터링
 * - settlementStatus: 'COMPLETED' | 'PENDING' 등 정산 상태 필터링
 * - page: 페이지 번호 (기본: 1)
 * - pageSize: 페이지 크기 (기본: 20, 최대: 100)
 * - sort: 'created_at' | 'amount' (기본: created_at)
 * - order: 'asc' | 'desc' (기본: desc)
 *
 * Response:
 * {
 *   success: true,
 *   data: { bets: Bet[] },
 *   meta: { page, pageSize, total, totalPages }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Query 파라미터 파싱
    const params = parseQueryParams(request);

    // 2. Service 호출 (registry에서 조립된 인스턴스 사용)
    const result = await registry.betService.getBets(params);

    // 3. 성공 응답 반환 (메타데이터 포함)
    return createSuccessResponseWithMeta(result.bets, result.meta);
  } catch (error) {
    // 4. 에러 처리 (Service 에러 → HTTP 응답)
    return handleApiError(error);
  }
}

/**
 * Query 파라미터 파싱 헬퍼 함수
 *
 * HTTP 요청의 URL Search Params를 Service가 이해할 수 있는 객체 형태로 변환합니다.
 * 값의 타입 검증은 Service Layer(Zod)에서 수행하므로, 여기서는 문자열 파싱 위주로 처리합니다.
 *
 * @param request NextRequest 객체
 * @returns 파싱된 파라미터 객체
 */
function parseQueryParams(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  return {
    roundId: searchParams.get('roundId') ?? undefined,
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
