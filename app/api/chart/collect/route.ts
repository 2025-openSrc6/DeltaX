import { getDb } from '@/lib/db';
import { chartData } from '@/db/schema';
import { fetchTickPrice, type SupportedAsset } from '@/lib/services/binance';
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, gte } from 'drizzle-orm';

const TARGET_ASSETS: SupportedAsset[] = ['PAXG', 'BTC'];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const results: Record<string, { chartData: string }> = {};

    for (const asset of TARGET_ASSETS) {
      // 1. 경량 가격 조회 (ticker/price - 5초 폴링용)
      const { price, timestamp } = await fetchTickPrice(asset);

      // 2. 중복 체크 (초 단위 - 동일 초는 skip)
      const oneSecondAgo = new Date(timestamp.getTime() - 1000);
      const existing = await db
        .select()
        .from(chartData)
        .where(and(eq(chartData.asset, asset), gte(chartData.timestamp, oneSecondAgo)))
        .limit(1);

      if (existing.length > 0) {
        results[asset] = { chartData: 'skipped' };
        continue;
      }

      // 3. chartData 저장 (close만 의미 있음, 나머지는 스키마 호환용)
      const [insertedChartData] = await db
        .insert(chartData)
        .values({
          asset,
          timestamp,
          close: price,
          open: price, // fake OHLC (스키마 유지용)
          high: price,
          low: price,
          volume: 0, // ticker/price는 volume 제공 안 함
          // 파생 지표: null (계산 안 함, 사용 안 함)
          volatility: null,
          averageVolatility: null,
          volatilityChangeRate: null,
          volatilityScore: null,
          movementIntensity: null,
          trendStrength: null,
          relativePosition: null,
          rsi: null,
        })
        .returning({ id: chartData.id });

      results[asset] = {
        chartData: insertedChartData.id,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        collected: results,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('POST /api/chart/collect error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'COLLECTION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to collect chart data',
        },
      },
      { status: 500 },
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(request: NextRequest) {
  try {
    const db = getDb();

    const latestData = await Promise.all(
      TARGET_ASSETS.map(async (asset) => {
        const [latest] = await db
          .select()
          .from(chartData)
          .where(eq(chartData.asset, asset))
          .orderBy(desc(chartData.timestamp))
          .limit(1);

        return { asset, data: latest || null };
      }),
    );

    return NextResponse.json({
      success: true,
      data: { latest: latestData },
    });
  } catch (error) {
    console.error('GET /api/chart/collect error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: 'Failed to fetch latest data',
        },
      },
      { status: 500 },
    );
  }
}
