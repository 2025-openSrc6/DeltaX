import { fetchRoundSnapshotKline1m } from '@/lib/services/binance';
import type { PriceData } from './types';

type SnapshotKind = 'start' | 'end';

/**
 * 라운드 시작/종료 가격 스냅샷을 Binance 1m kline close로 캡처해 PriceData로 변환
 * - 정산/온체인 검증을 위해 캔들 메타를 meta에 포함
 */
async function fetchPriceSnapshot(kind: SnapshotKind): Promise<PriceData> {
  const [paxgSnapshot, btcSnapshot] = await Promise.all([
    fetchRoundSnapshotKline1m('PAXG'),
    fetchRoundSnapshotKline1m('BTC'),
  ]);

  const snapshotTimestamp = Math.max(paxgSnapshot.closeTimeMs, btcSnapshot.closeTimeMs);

  return {
    gold: paxgSnapshot.close,
    btc: btcSnapshot.close,
    timestamp: snapshotTimestamp,
    source: 'binance_klines_1m',
    meta: {
      kind,
      paxg: paxgSnapshot.onchainMeta,
      btc: btcSnapshot.onchainMeta,
    },
  };
}

export async function fetchStartPriceSnapshot(): Promise<PriceData> {
  return fetchPriceSnapshot('start');
}

export async function fetchEndPriceSnapshot(): Promise<PriceData> {
  return fetchPriceSnapshot('end');
}
