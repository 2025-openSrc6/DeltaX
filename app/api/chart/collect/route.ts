import { getDb } from '@/lib/db';
import { chartData, volatilitySnapshots } from '@/db/schema';
import { fetchKlines, fetchCurrentPrice, type SupportedAsset } from '@/lib/services/binance';
import {
  calculateStdDev,
  calculateVolatilityChangeRate,
  calculateVolatilityScore,
  calculateMovementIntensity,
  calculateTrendStrength,
  calculateRelativePosition,
  calculateRSI,
  calculateATR,
  calculateBollingerBands,
  calculateMACD,
} from '@/lib/services/volatility';
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, gte } from 'drizzle-orm';

const TARGET_ASSETS: SupportedAsset[] = ['PAXG', 'BTC'];
const VOLATILITY_LOOKBACK = 20;
const HISTORY_PERIOD = 500; // 과거 데이터로 변동성 계산

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const results: Record<string, { chartData: string; volatilitySnapshot: string }> = {};

    for (const asset of TARGET_ASSETS) {
      // 1. 실시간 현재 가격 조회 (초 단위 업데이트!)
      const currentTicker = await fetchCurrentPrice(asset);
      const currentPrice = parseFloat(currentTicker.price);
      const timestamp = new Date(); // 현재 시간!

      // 2. 중복 체크 (초 단위 - 동일 초는 skip)
      const oneSecondAgo = new Date(timestamp.getTime() - 1000);
      const existing = await db
        .select()
        .from(chartData)
        .where(
          and(
            eq(chartData.asset, asset),
            gte(chartData.timestamp, oneSecondAgo)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        results[asset] = { chartData: 'skipped', volatilitySnapshot: 'skipped' };
        continue;
      }

      // 3. 과거 데이터로 변동성 계산 (DB에서 조회)
      const recentData = await db
        .select()
        .from(chartData)
        .where(eq(chartData.asset, asset))
        .orderBy(desc(chartData.timestamp))
        .limit(HISTORY_PERIOD);

      const closePrices = recentData.length > 0
        ? [...recentData.map((d: typeof chartData.$inferSelect) => d.close).reverse(), currentPrice]
        : [currentPrice];

      const recentPrices = closePrices.slice(-VOLATILITY_LOOKBACK);

      // 변동성 계산
      const currentVolatility = calculateStdDev(recentPrices);
      const averageVolatility = calculateStdDev(closePrices);
      const volatilityChangeRate = calculateVolatilityChangeRate(
        currentVolatility,
        averageVolatility,
      );
      const volatilityScore = calculateVolatilityScore(volatilityChangeRate);

      // 4. OHLC 추정 (실시간 가격 기반)
      // 최근 가격을 기반으로 간단한 OHLC 생성
      const recentClose = recentData[0]?.close || currentPrice;
      const ohlcData = {
        open: recentClose,
        high: Math.max(recentClose, currentPrice),
        low: Math.min(recentClose, currentPrice),
        close: currentPrice,
      };

      const movementIntensity = calculateMovementIntensity(ohlcData);
      const trendStrength = calculateTrendStrength(ohlcData);
      const relativePosition = calculateRelativePosition(ohlcData);
      const rsi = calculateRSI(closePrices);

      // chartData 저장
      const [insertedChartData] = await db
        .insert(chartData)
        .values({
          asset,
          timestamp,
          open: ohlcData.open,
          high: ohlcData.high,
          low: ohlcData.low,
          close: ohlcData.close,
          volume: parseFloat(currentTicker.volume),
          volatility: currentVolatility,
          averageVolatility,
          volatilityChangeRate,
          volatilityScore,
          movementIntensity,
          trendStrength,
          relativePosition,
          rsi,
        })
        .returning({ id: chartData.id });

      // volatilitySnapshots 계산 및 저장
      const ohlcArray = recentData.length > 0
        ? recentData.map((d: typeof chartData.$inferSelect) => ({
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })).reverse()
        : [ohlcData];

      const atr = calculateATR(ohlcArray);
      const bollingerBands = calculateBollingerBands(closePrices);
      const macd = calculateMACD(closePrices);
      const percentChange =
        closePrices.length >= 2
          ? ((closePrices[closePrices.length - 1] - closePrices[0]) / closePrices[0]) * 100
          : 0;

      const [insertedSnapshot] = await db
        .insert(volatilitySnapshots)
        .values({
          asset,
          timestamp,
          stdDev: currentVolatility,
          percentChange,
          atr,
          bollingerUpper: bollingerBands.upper,
          bollingerMiddle: bollingerBands.middle,
          bollingerLower: bollingerBands.lower,
          bollingerBandwidth: bollingerBands.bandwidth,
          macd: macd.macd,
          macdSignal: macd.signal,
          macdHistogram: macd.histogram,
        })
        .returning({ id: volatilitySnapshots.id });

      results[asset] = {
        chartData: insertedChartData.id,
        volatilitySnapshot: insertedSnapshot.id,
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
