'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 차트 데이터 포인트 타입
 */
export interface ChartDataPoint {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 차트 데이터 조회 커스텀 훅
 *
 * 지정된 자산과 기간의 차트 데이터를 조회하고 자동 업데이트합니다.
 *
 * @param asset - 조회할 자산 ('PAXG' | 'BTC')
 * @param period - 조회 기간 ('1h' | '24h' | '7d')
 * @param refreshInterval - 자동 업데이트 간격 (밀리초, 기본: 60000 = 1분)
 * @returns 차트 데이터, 로딩 상태, 에러, 수동 refetch 함수
 *
 * @example
 * ```tsx
 * // 기본 (1분마다 업데이트)
 * const { data, loading } = useChartData('PAXG', '24h');
 *
 * // 5초마다 업데이트
 * const { data, loading } = useChartData('PAXG', '1h', 5000);
 *
 * // 실시간 (1초마다)
 * const { data, loading } = useChartData('BTC', '1h', 1000);
 * ```
 */
export function useChartData(
  asset: 'PAXG' | 'BTC',
  period: '1h' | '24h' | '7d',
  refreshInterval: number = 60000, // 기본 1분
) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      // /api/chart/historical 엔드포인트 호출
      const response = await fetch(`/api/chart/historical?asset=${asset}&period=${period}`);
      const result = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error?.message || '차트 데이터 조회 실패');
      }

      // 데이터 변환: timestamp를 Date 객체로
      const chartData: ChartDataPoint[] = (result.data.data || []).map((item: any) => ({
        timestamp: new Date(item.timestamp),
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }));

      setData(chartData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(errorMessage);
      console.error('Chart data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [asset, period]);

  useEffect(() => {
    // 초기 데이터 로드
    fetchData();

    // 설정된 간격마다 자동 업데이트
    const interval = setInterval(fetchData, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}
