import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';

/**
 * POST /api/sui/bet/prepare
 *
 * 베팅용 PTB를 서버에서 빌드한 뒤, base64 txBytes + nonce + expiresAt을 반환합니다.
 * - 입력 검증/가스 세팅/dry-run은 Service에서 처리.
 * - nonce/txBytes 해시는 Upstash Redis에 TTL로 저장해 실행 단계에서 재사용/변조 방지.
 *
 * Request Body:
 * {
 *   userAddress: "0x...",   // Sui address
 *   poolId: "0x...",        // shared pool object id
 *   prediction: 1 | 2,      // 1=GOLD, 2=BTC
 *   userDelCoinId: "0x...", // user's DEL Coin object id
 *   betId: "<uuid>"         // bets.id (DB row to update on execute)
 *   userId: "<uuid>"        // authenticated user id (for nonce binding)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: { txBytes: "<base64>", nonce: "<uuid>", expiresAt: <ms epoch> }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = await registry.suiService.prepareBetTransaction(body);

    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
