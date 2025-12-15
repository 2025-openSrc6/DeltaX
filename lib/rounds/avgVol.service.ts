import { fetchKlines } from '@/lib/services/binance';
import { calculateStdDev } from '@/lib/services/volatility';

export const SETTLEMENT_AVGVOL_CONFIG = {
  interval: '1h',
  lookback: 720, // 30d * 24h
  method: 'returns_stddev',
  source: 'binance_klines',
  minDataPoints: 360, // 최소 15일 데이터 필요
  version: 'v1',
} as const;

function calculateReturnsStdDevFromCloses(closes: number[]): {
  avgVol: number;
  dataPoints: number;
} {
  if (closes.length < 2) return { avgVol: 0, dataPoints: 0 };
  const returnsPct: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0) continue;
    returnsPct.push(((cur - prev) / prev) * 100);
  }
  return { avgVol: calculateStdDev(returnsPct), dataPoints: returnsPct.length };
}

export async function calculateSettlementAvgVol(): Promise<{
  goldAvgVol: number;
  btcAvgVol: number;
  meta: {
    interval: string;
    lookback: number;
    source: string;
    method: string;
    minDataPoints: number;
    dataPoints: { gold: number; btc: number };
    calculatedAt: string;
    version: string;
  };
}> {
  const [goldKlines, btcKlines] = await Promise.all([
    fetchKlines('PAXG', SETTLEMENT_AVGVOL_CONFIG.interval, SETTLEMENT_AVGVOL_CONFIG.lookback),
    fetchKlines('BTC', SETTLEMENT_AVGVOL_CONFIG.interval, SETTLEMENT_AVGVOL_CONFIG.lookback),
  ]);

  const goldCloses = goldKlines.map((k) => k.close);
  const btcCloses = btcKlines.map((k) => k.close);

  const gold = calculateReturnsStdDevFromCloses(goldCloses);
  const btc = calculateReturnsStdDevFromCloses(btcCloses);

  const goldAvgVol = gold.dataPoints >= SETTLEMENT_AVGVOL_CONFIG.minDataPoints ? gold.avgVol : 0;
  const btcAvgVol = btc.dataPoints >= SETTLEMENT_AVGVOL_CONFIG.minDataPoints ? btc.avgVol : 0;

  return {
    goldAvgVol,
    btcAvgVol,
    meta: {
      interval: SETTLEMENT_AVGVOL_CONFIG.interval,
      lookback: SETTLEMENT_AVGVOL_CONFIG.lookback,
      source: SETTLEMENT_AVGVOL_CONFIG.source,
      method: SETTLEMENT_AVGVOL_CONFIG.method,
      minDataPoints: SETTLEMENT_AVGVOL_CONFIG.minDataPoints,
      dataPoints: { gold: gold.dataPoints, btc: btc.dataPoints },
      calculatedAt: new Date().toISOString(),
      version: SETTLEMENT_AVGVOL_CONFIG.version,
    },
  };
}
