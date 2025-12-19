import { NextResponse } from 'next/server';
import { fetchCurrentPrice } from '@/lib/services/binance';

/**
 * 베팅 라운드 오픈 시 사용할 가격 스냅샷 API
 *
 * GET /api/price/snapshot
 *
 * 현재 PAXG와 BTC의 가격을 조회합니다.
 * Binance API 실패 시 fallback 처리를 포함합니다.
 */
export async function GET() {
  try {
    // PAXG와 BTC 가격을 병렬로 조회
    const [paxgResult, btcResult] = await Promise.allSettled([
      fetchCurrentPrice('PAXG'),
      fetchCurrentPrice('BTC'),
    ]);

    const timestamp = new Date().toISOString();

    // 결과 처리 - 가격 값만 추출
    const paxgData =
      paxgResult.status === 'fulfilled'
        ? {
            price: parseFloat(paxgResult.value.price), // 문자열을 숫자로 변환
            timestamp,
            source: 'binance' as const,
          }
        : {
            price: 0, // fallback 가격 (실제로는 다른 소스에서 가져와야 함)
            timestamp,
            source: 'fallback' as const,
            error: paxgResult.reason?.message || 'Failed to fetch PAXG price',
          };

    const btcData =
      btcResult.status === 'fulfilled'
        ? {
            price: parseFloat(btcResult.value.price), // 문자열을 숫자로 변환
            timestamp,
            source: 'binance' as const,
          }
        : {
            price: 0, // fallback 가격
            timestamp,
            source: 'fallback' as const,
            error: btcResult.reason?.message || 'Failed to fetch BTC price',
          };

    // 두 가격 모두 실패한 경우
    if (paxgData.source === 'fallback' && btcData.source === 'fallback') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PRICE_FETCH_FAILED',
            message: 'Failed to fetch prices from Binance API',
            details: {
              PAXG: paxgData.error,
              BTC: btcData.error,
            },
          },
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        PAXG: paxgData,
        BTC: btcData,
      },
      timestamp,
    });
  } catch (error) {
    console.error('GET /api/price/snapshot error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch price snapshot',
        },
      },
      { status: 500 },
    );
  }
}
