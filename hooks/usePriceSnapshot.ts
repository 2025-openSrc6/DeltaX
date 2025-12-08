'use client';

import { useState, useCallback } from 'react';

/**
 * 가격 스냅샷 데이터 타입
 */
interface PriceData {
  price: number;
  timestamp: string;
  source: 'binance' | 'fallback';
  error?: string;
}

interface PriceSnapshot {
  PAXG: PriceData;
  BTC: PriceData;
}

interface SnapshotResponse {
  success: boolean;
  data?: PriceSnapshot;
  timestamp?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 가격 스냅샷 조회 커스텀 훅
 *
 * 베팅 라운드 생성 시 사용할 가격을 조회합니다.
 *
 * @example
 * ```tsx
 * const { snapshot, loading, error, fetchSnapshot } = usePriceSnapshot();
 *
 * async function createRound() {
 *   await fetchSnapshot();
 *   if (snapshot) {
 *     await createRoundAPI({
 *       goldStartPrice: snapshot.PAXG.price,
 *       btcStartPrice: snapshot.BTC.price,
 *     });
 *   }
 * }
 * ```
 */
export function usePriceSnapshot() {
  const [snapshot, setSnapshot] = useState<PriceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/price/snapshot');
      const data: SnapshotResponse = await response.json();

      if (!data.success || !data.data) {
        throw new Error(data.error?.message || 'Failed to fetch price snapshot');
      }

      setSnapshot(data.data);
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Price snapshot fetch error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    snapshot,
    loading,
    error,
    fetchSnapshot,
  };
}
