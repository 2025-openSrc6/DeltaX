import { getDb } from '@/lib/db';
import { chartData } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { fetchKlines } from '@/lib/services/binance';

// Asset 타입
type SupportedAsset = 'PAXG' | 'BTC' | 'ETH' | 'SOL';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const asset = searchParams.get('asset') as SupportedAsset | null;
    const period = searchParams.get('period') || '1h';

    if (!asset) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: 'Asset parameter is required',
          },
        },
        { status: 400 },
      );
    }

    // 기간 계산
    const periodMs = getPeriodMs(period);
    const startTime = new Date(Date.now() - periodMs);

    // 데이터 조회
    const data = await db
      .select()
      .from(chartData)
      .where(and(eq(chartData.asset, asset), gte(chartData.timestamp, startTime)))
      .orderBy(chartData.timestamp);

    // DB에 데이터가 충분하면 DB 사용
    if (data.length >= 10) {
      return NextResponse.json({
        success: true,
        data: {
          asset,
          period,
          source: 'database',
          dataPoints: data.length,
          data: data.map((d: typeof chartData.$inferSelect) => ({
            timestamp: d.timestamp.toISOString(),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume,
            volatility: d.volatility,
          })),
        },
      });
    }

    // DB에 데이터 없거나 부족하면 Binance에서 직접 가져오기
    console.log(`[Chart] DB data insufficient (${data.length}), fetching from Binance...`);

    const interval = period === '1h' ? '1m' : '1h'; // 1시간에는 1분봉, 24시간에는 1시간봉
    const limit = period === '1h' ? 60 : 24;

    const klines = await fetchKlines(asset, interval, limit);

    const binanceData = klines.map((k) => ({
      timestamp: new Date(k.openTime).toISOString(),
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      volatility: null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        asset,
        period,
        source: 'binance',
        dataPoints: binanceData.length,
        data: binanceData,
      },
    });
  } catch (error) {
    console.error('GET /api/chart/historical error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch historical data',
        },
      },
      { status: 500 },
    );
  }
}

function getPeriodMs(period: string): number {
  const periods: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return periods[period] || periods['24h'];
}
