import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { registry } from '@/lib/registry';
import { NextRequest } from 'next/server';

/**
 * POST /api/sui/bet/execute
 *
 * 프런트가 받은 txBytes(base64) + userSignature + nonce + betId를 받아
 * - nonce/txBytes 해시/만료 검증
 * - 스폰서 서명 후 체인 실행
 * - 실행 성공 시 bets.suiTxHash 업데이트를 수행합니다.
 *
 * Request Body:
 * {
 *   txBytes: "<base64>",        // prepare에서 받은 txBytes
 *   userSignature: "<base64>",  // wallet signTransactionBlock 결과
 *   nonce: "<uuid>",            // prepare 응답의 nonce
 *   betId: "<uuid>",            // 업데이트할 bets.id
 *   userId: "<uuid>"            // authenticated user id (for nonce binding)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: { digest: "<tx_digest>" }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = await registry.suiService.executeBetTransaction(body);

    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
