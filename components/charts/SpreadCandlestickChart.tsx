'use client';

import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { useState, useEffect } from 'react';

interface SpreadCandlestickChartProps {
  height?: number;
  period?: '1h' | '24h' | '7d';
  refreshInterval?: number;
  maxDataPoints?: number;
  roundType?: string;
}

interface CandleData {
  timestamp: string;
  value: number; // PAXG 강도 - BTC 강도
  winner: 'PAXG' | 'BTC';
  paxgStrength: number;
  btcStrength: number;
}

/**
 * 정규화 강도 스프레드 캔들차트
 *
 * PAXG가 이기면 빨간 양봉, BTC가 이기면 파란 음봉으로 표시
 *
 * @example
 * ```tsx
 * <SpreadCandlestickChart height={300} period="1h" />
 * ```
 */
export default function SpreadCandlestickChart({
  height = 300,
  period = '1h',
  refreshInterval = 10000,
  maxDataPoints = 50,
  roundType = 'DEMO_3MIN',
}: SpreadCandlestickChartProps) {
  const [data, setData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    currentWinner: 'TIE' as 'PAXG' | 'BTC' | 'TIE',
    currentSpread: 0,
    paxgWinRate: 0,
  });

  const fetchData = async () => {
    try {
      setError(null);

      const response = await fetch(
        `/api/chart/normalized-strength?period=${period}&roundType=${roundType}`,
      );
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || '데이터 조회 실패');
      }

      const rawData = result.data.data;

      // 최근 N개만 표시 (슬라이싱)
      const slicedData = rawData.slice(-maxDataPoints);

      const candleData: CandleData[] = slicedData.map(
        (item: {
          timestamp: string;
          spread: number;
          winner: 'PAXG' | 'BTC';
          paxgStrength: number;
          btcStrength: number;
        }) => ({
          timestamp: item.timestamp,
          value: item.spread, // PAXG - BTC
          winner: item.winner,
          paxgStrength: item.paxgStrength,
          btcStrength: item.btcStrength,
        }),
      );

      setData(candleData);

      // 통계 계산
      if (candleData.length > 0) {
        const latest = candleData[candleData.length - 1];
        const paxgWins = candleData.filter((d) => d.winner === 'PAXG').length;

        setStats({
          currentWinner: latest.winner,
          currentSpread: latest.value,
          paxgWinRate: (paxgWins / candleData.length) * 100,
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
  }, [period, refreshInterval, maxDataPoints]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-cyan-600">데이터 로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-red-600">오류: {error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-cyan-600">데이터가 없습니다</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 헤더 통계 */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-cyan-50 border border-cyan-200 p-3">
          <div className="text-sm text-cyan-700">현재 우세</div>
          <div
            className={`text-2xl font-bold ${stats.currentWinner === 'PAXG' ? 'text-red-600' : stats.currentWinner === 'BTC' ? 'text-blue-600' : 'text-cyan-700'}`}
          >
            {stats.currentWinner === 'TIE' ? '동률' : stats.currentWinner}
          </div>
          <div className="text-xs text-cyan-600">
            {stats.currentWinner === 'PAXG'
              ? '🔴 양봉'
              : stats.currentWinner === 'BTC'
                ? '🔵 음봉'
                : '➡️'}
          </div>
        </div>

        <div className="rounded-lg bg-cyan-50 border border-cyan-200 p-3">
          <div className="text-sm text-cyan-700">격차</div>
          <div
            className={`text-2xl font-bold ${Math.abs(stats.currentSpread) >= 0.5 ? 'text-yellow-600' : 'text-cyan-800'}`}
          >
            {Math.abs(stats.currentSpread).toFixed(2)}
          </div>
          <div className="text-xs text-cyan-600">
            {Math.abs(stats.currentSpread) >= 0.5 ? '큰 격차' : '작은 격차'}
          </div>
        </div>

        <div className="rounded-lg bg-cyan-50 border border-cyan-200 p-3">
          <div className="text-sm text-cyan-700">PAXG 승률</div>
          <div
            className={`text-2xl font-bold ${stats.paxgWinRate >= 50 ? 'text-red-600' : 'text-blue-600'}`}
          >
            {stats.paxgWinRate.toFixed(0)}%
          </div>
          <div className="text-xs text-cyan-600">최근 {data.length}개 데이터</div>
        </div>
      </div>

      {/* 차트 */}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />

          {/* X축 시간 표시 */}
          <XAxis
            dataKey="timestamp"
            stroke="#64748b"
            style={{ fontSize: '12px' }}
            tickFormatter={(value: string) => {
              if (!value) return '';
              const date = new Date(value);
              // 시간만 표시 (HH:mm 형식)
              const hours = date.getHours().toString().padStart(2, '0');
              const minutes = date.getMinutes().toString().padStart(2, '0');
              return `${hours}:${minutes}`;
            }}
          />

          <YAxis
            stroke="#64748b"
            style={{ fontSize: '12px' }}
            label={{ value: '강도 차이', angle: -90, position: 'insideLeft', fill: '#64748b' }}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              color: '#1e293b',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
            formatter={(value: number, _name: string, props: { payload?: CandleData }) => {
              const payload = props.payload;
              if (!payload) return ['-'];
              return [
                <div key="tooltip" className="space-y-1">
                  <div
                    className={`font-bold ${payload.winner === 'PAXG' ? 'text-red-600' : 'text-blue-600'}`}
                  >
                    {payload.winner} 우세
                  </div>
                  <div className="text-slate-700">격차: {Math.abs(value).toFixed(3)}</div>
                  <div className="text-xs text-slate-600">
                    PAXG: {payload.paxgStrength.toFixed(2)}x
                  </div>
                  <div className="text-xs text-slate-600">
                    BTC: {payload.btcStrength.toFixed(2)}x
                  </div>
                </div>,
              ];
            }}
            labelFormatter={() => ''}
          />

          {/* 기준선 (0 = 동률) */}
          <ReferenceLine
            y={0}
            stroke="#94a3b8"
            strokeWidth={2}
            label={{ value: '동률선', fill: '#64748b', fontSize: 12 }}
          />

          {/* 양봉/음봉 바 */}
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.winner === 'PAXG' ? '#f87171' : '#60a5fa'} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>

      {/* 설명 */}
      <div className="mt-4 text-xs text-cyan-700">
        <p>• 🔴 빨간 양봉: PAXG가 더 강함 (위로) | 🔵 파란 음봉: BTC가 더 강함 (아래로)</p>
        <p>• 막대 길이 = 강도 격차 (클수록 압도적)</p>
      </div>
    </div>
  );
}
