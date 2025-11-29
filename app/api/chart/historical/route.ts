import { getDb } from '@/lib/db';
import { chartData } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const asset = searchParams.get('asset');
    const period = searchParams.get('period') || '24h';

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

    if (data.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_DATA',
            message: `No data found for ${asset}`,
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        asset,
        period,
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
