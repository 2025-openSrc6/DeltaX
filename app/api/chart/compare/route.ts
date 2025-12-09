import { getDb } from '@/lib/db';
import { chartData } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { compareVolatilityAdjustedReturns } from '@/lib/services/volatility';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const asset1 = searchParams.get('asset1') || 'PAXG';
    const asset2 = searchParams.get('asset2') || 'BTC';
    const period = searchParams.get('period') || '24h';

    // 기간 계산
    const periodMs = getPeriodMs(period);
    const startTime = new Date(Date.now() - periodMs);

    // 두 자산의 데이터 조회
    const [data1, data2] = await Promise.all([
      db
        .select()
        .from(chartData)
        .where(and(eq(chartData.asset, asset1), gte(chartData.timestamp, startTime)))
        .orderBy(chartData.timestamp),
      db
        .select()
        .from(chartData)
        .where(and(eq(chartData.asset, asset2), gte(chartData.timestamp, startTime)))
        .orderBy(chartData.timestamp),
    ]);

    if (data1.length === 0 || data2.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INSUFFICIENT_DATA',
            message: 'Not enough data for comparison',
          },
        },
        { status: 404 },
      );
    }

    // 가격 배열 추출
    const prices1 = data1.map((d: typeof chartData.$inferSelect) => d.close);
    const prices2 = data2.map((d: typeof chartData.$inferSelect) => d.close);

    // 변동성 대비 변동률 비교
    const comparison = compareVolatilityAdjustedReturns(prices1, prices2);

    // 응답 데이터 구성
    const response = {
      success: true,
      data: {
        asset1: {
          name: asset1,
          volatility: comparison.asset1.volatility,
          return: comparison.asset1.return,
          adjustedReturn: comparison.asset1.adjustedReturn,
          currentPrice: data1[data1.length - 1].close,
          startPrice: data1[0].close,
          dataPoints: data1.length,
        },
        asset2: {
          name: asset2,
          volatility: comparison.asset2.volatility,
          return: comparison.asset2.return,
          adjustedReturn: comparison.asset2.adjustedReturn,
          currentPrice: data2[data2.length - 1].close,
          startPrice: data2[0].close,
          dataPoints: data2.length,
        },
        comparison: {
          winner:
            comparison.winner === 'asset1'
              ? asset1
              : comparison.winner === 'asset2'
                ? asset2
                : 'tie',
          confidence: comparison.confidence,
          difference: comparison.difference,
          interpretation: getInterpretation(
            comparison.winner,
            asset1,
            asset2,
            comparison.confidence,
          ),
        },
        period,
        timestamp: new Date().toISOString(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('GET /api/chart/compare error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'COMPARISON_ERROR',
          message: error instanceof Error ? error.message : 'Failed to compare assets',
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

function getInterpretation(
  winner: 'asset1' | 'asset2' | 'tie',
  asset1: string,
  asset2: string,
  confidence: number,
): string {
  if (winner === 'tie') {
    return `${asset1} and ${asset2} show similar volatility-adjusted returns`;
  }

  const winnerName = winner === 'asset1' ? asset1 : asset2;
  const loserName = winner === 'asset1' ? asset2 : asset1;
  const confidencePercent = (confidence * 100).toFixed(0);

  return `${winnerName} shows higher volatility-adjusted return than ${loserName} (${confidencePercent}% confidence)`;
}
