import { fetchAvgVolKlines1h720 } from '@/lib/services/binance';
import { calculateAverageVolatility } from '@/lib/services/normalizedStrength';

export const SETTLEMENT_AVGVOL_CONFIG = {
  interval: '1h',
  windowCandles: 720, // 30d * 24h
  avgVolDefinition: 'returns_stddev_percent',
  source: 'binance_klines',
  minDataPoints: 360, // 최소 15일 데이터 필요
  methodVersion: 'v1',
} as const;

const LOOKBACK_DAYS = SETTLEMENT_AVGVOL_CONFIG.windowCandles / 24;

export async function calculateSettlementAvgVol(): Promise<{
  goldAvgVol: number;
  btcAvgVol: number;
  meta: {
    fetch: {
      gold: {
        exchange: 'binance';
        endpoint: '/api/v3/klines';
        symbol: string;
        interval: '1h';
        limit: 720;
        firstOpenTimeMs: number;
        lastCloseTimeMs: number;
      };
      btc: {
        exchange: 'binance';
        endpoint: '/api/v3/klines';
        symbol: string;
        interval: '1h';
        limit: 720;
        firstOpenTimeMs: number;
        lastCloseTimeMs: number;
      };
    };
    calculation: {
      avgVolDefinition: 'returns_stddev_percent';
      window: { unit: 'candles'; count: number };
      methodVersion: string;
      minDataPoints: number;
      dataPoints: { gold: number; btc: number };
      calculatedAt: string;
      interval: string;
      source: string;
    };
  };
}> {
  const [goldData, btcData] = await Promise.all([
    fetchAvgVolKlines1h720('PAXG'),
    fetchAvgVolKlines1h720('BTC'),
  ]);

  const goldCloses = goldData.closes;
  const btcCloses = btcData.closes;

  const goldReturns: number[] = [];
  const btcReturns: number[] = [];
  for (let i = 1; i < Math.min(goldCloses.length, SETTLEMENT_AVGVOL_CONFIG.windowCandles); i++) {
    const prev = goldCloses[i - 1];
    const cur = goldCloses[i];
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0) continue;
    goldReturns.push(((cur - prev) / prev) * 100);
  }
  for (let i = 1; i < Math.min(btcCloses.length, SETTLEMENT_AVGVOL_CONFIG.windowCandles); i++) {
    const prev = btcCloses[i - 1];
    const cur = btcCloses[i];
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0) continue;
    btcReturns.push(((cur - prev) / prev) * 100);
  }

  const goldAvgVol =
    goldReturns.length >= SETTLEMENT_AVGVOL_CONFIG.minDataPoints
      ? calculateAverageVolatility(goldCloses, LOOKBACK_DAYS)
      : 0;
  const btcAvgVol =
    btcReturns.length >= SETTLEMENT_AVGVOL_CONFIG.minDataPoints
      ? calculateAverageVolatility(btcCloses, LOOKBACK_DAYS)
      : 0;

  return {
    goldAvgVol,
    btcAvgVol,
    meta: {
      fetch: {
        gold: goldData.onchainMeta,
        btc: btcData.onchainMeta,
      },
      calculation: {
        avgVolDefinition: SETTLEMENT_AVGVOL_CONFIG.avgVolDefinition,
        window: { unit: 'candles', count: SETTLEMENT_AVGVOL_CONFIG.windowCandles },
        methodVersion: SETTLEMENT_AVGVOL_CONFIG.methodVersion,
        minDataPoints: SETTLEMENT_AVGVOL_CONFIG.minDataPoints,
        dataPoints: { gold: goldReturns.length, btc: btcReturns.length },
        calculatedAt: new Date().toISOString(),
        interval: SETTLEMENT_AVGVOL_CONFIG.interval,
        source: SETTLEMENT_AVGVOL_CONFIG.source,
      },
    },
  };
}
