'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useState, useEffect } from 'react';

interface NormalizedStrengthChartProps {
  height?: number;
  period?: '1h' | '24h' | '7d';
  refreshInterval?: number;
  maxDataPoints?: number; // 슬라이싱: 최대 데이터 포인트 수
}

interface ChartDataPoint {
  timestamp: string;
  paxg: number;
  btc: number;
  time: string;
}

/**
 * 정규화 강도 차트 컴포넌트
 *
 * PAXG vs BTC를 평소 변동성 대비 비교하여 공정한 비교를 제공합니다.
 *
 * @example
 * ```tsx
 * <NormalizedStrengthChart height={400} period="1h" maxDataPoints={50} />
 * ```
 */
export default function NormalizedStrengthChart({
  height = 400,
  period = '1h',
  refreshInterval = 10000,
  maxDataPoints = 100, // 기본값: 최근 100개
}: NormalizedStrengthChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    paxgCurrent: 0,
    btcCurrent: 0,
    winner: 'TIE' as 'PAXG' | 'BTC' | 'TIE',
    spread: 0,
  });

  const fetchData = async () => {
    try {
      setError(null);

      // API에서 정규화 강도 데이터 조회
      const response = await fetch(`/api/chart/normalized-strength?period=${period}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || '데이터 조회 실패');
      }

      // 최근 N개만 표시 (슬라이싱)
      const rawData = result.data.data;
      const slicedData = rawData.slice(-maxDataPoints);

      const chartData = slicedData.map(
        (item: { timestamp: string; paxgStrength: number; btcStrength: number }) => ({
          timestamp: item.timestamp,
          paxg: item.paxgStrength,
          btc: item.btcStrength,
          time: new Date(item.timestamp).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        }),
      );

      setData(chartData);

      // 최신 통계
      if (chartData.length > 0) {
        const latest = chartData[chartData.length - 1];
        setStats({
          paxgCurrent: latest.paxg,
          btcCurrent: latest.btc,
          winner: latest.paxg > latest.btc ? 'PAXG' : latest.paxg < latest.btc ? 'BTC' : 'TIE',
          spread: latest.paxg - latest.btc,
        });
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, refreshInterval, maxDataPoints]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-gray-400">데이터 로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-red-400">오류: {error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-gray-400">데이터가 없습니다</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 헤더 통계 */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-gray-800/50 p-3">
          <div className="text-sm text-gray-400">PAXG 강도</div>
          <div
            className={`text-2xl font-bold ${stats.paxgCurrent >= 1 ? 'text-green-400' : 'text-gray-300'}`}
          >
            {stats.paxgCurrent.toFixed(2)}x
          </div>
          <div className="text-xs text-gray-500">
            {stats.paxgCurrent >= 1 ? '평소보다 강함' : '평소보다 약함'}
          </div>
        </div>

        <div className="rounded-lg bg-gray-800/50 p-3">
          <div className="text-sm text-gray-400">BTC 강도</div>
          <div
            className={`text-2xl font-bold ${stats.btcCurrent >= 1 ? 'text-orange-400' : 'text-gray-300'}`}
          >
            {stats.btcCurrent.toFixed(2)}x
          </div>
          <div className="text-xs text-gray-500">
            {stats.btcCurrent >= 1 ? '평소보다 강함' : '평소보다 약함'}
          </div>
        </div>

        <div className="rounded-lg bg-gray-800/50 p-3">
          <div className="text-sm text-gray-400">현재 우세</div>
          <div
            className={`text-2xl font-bold ${stats.winner === 'PAXG' ? 'text-green-400' : stats.winner === 'BTC' ? 'text-orange-400' : 'text-gray-400'}`}
          >
            {stats.winner === 'TIE' ? '동률' : stats.winner}
          </div>
          <div className="text-xs text-gray-500">격차: {Math.abs(stats.spread).toFixed(2)}</div>
        </div>
      </div>

      {/* 차트 */}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />

          {/* X축 숨김 */}
          <XAxis dataKey="time" hide={true} />

          <YAxis
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
            label={{ value: '강도 (배)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number) => [`${value.toFixed(3)}x`, '']}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="line" />

          {/* 기준선 (1.0 = 평소 수준) */}
          <ReferenceLine
            y={1}
            stroke="#6b7280"
            strokeDasharray="5 5"
            label={{ value: '평소 수준', fill: '#9ca3af', fontSize: 12 }}
          />

          {/* PAXG 라인 */}
          <Line
            type="monotone"
            dataKey="paxg"
            stroke="#10b981"
            strokeWidth={3}
            dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
            name="PAXG (금)"
          />

          {/* BTC 라인 */}
          <Line
            type="monotone"
            dataKey="btc"
            stroke="#f97316"
            strokeWidth={3}
            dot={{ fill: '#f97316', r: 4 }}
            activeDot={{ r: 6 }}
            name="BTC (비트코인)"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* 설명 */}
      <div className="mt-4 text-xs text-gray-500">
        <p>• 1.0 = 평소 수준 | 1.5 = 평소의 150% 강도 | 0.5 = 평소의 50% 강도</p>
        <p>• 평소 변동성 대비 얼마나 강하게 움직이는지 표시 (공정한 비교)</p>
        <p>• 최근 {data.length}개 데이터 포인트 표시</p>
      </div>
    </div>
  );
}
