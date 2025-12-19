'use client';

import { useChartData } from '@/hooks/useChartData';
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * BTC 가격 차트 컴포넌트의 Props
 */
interface BTCPriceChartProps {
  /** 차트 높이 (기본: 300px) */
  height?: number;
  /** 조회 기간 */
  period?: '1h' | '24h' | '7d';
  /** 거래량 표시 여부 */
  showVolume?: boolean;
  /** 테마 */
  theme?: 'dark' | 'light';
}

/**
 * BTC(비트코인) 가격 차트 컴포넌트
 *
 * 재사용 가능한 BTC 시세 차트를 표시합니다.
 */
export function BTCPriceChart({
  height = 300,
  period = '24h',
  // showVolume = true,
  theme = 'dark',
}: BTCPriceChartProps) {
  const { data, loading, error } = useChartData('BTC', period);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-gray-400">로딩 중...</div>
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

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-gray-400">데이터 없음</div>
      </div>
    );
  }

  // 색상 설정 (BTC는 주황색)
  const colors = {
    line: theme === 'dark' ? '#f97316' : '#ea580c', // 주황색
    area: theme === 'dark' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(234, 88, 12, 0.1)',
    text: theme === 'dark' ? '#e5e7eb' : '#374151',
    grid: theme === 'dark' ? '#374151' : '#d1d5db',
  };

  const currentPrice = data[data.length - 1]?.close || 0;
  const startPrice = data[0]?.close || 0;
  const isUp = currentPrice >= startPrice;

  const chartData = data.map((d) => ({
    time: d.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    price: d.close,
    volume: d.volume,
  }));

  return (
    <div className="w-full">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-2xl font-bold" style={{ color: colors.text }}>
          $
          {currentPrice.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        <span className={`text-sm ${isUp ? 'text-green-500' : 'text-red-500'}`}>
          {isUp ? '📈' : '📉'} {(((currentPrice - startPrice) / startPrice) * 100).toFixed(2)}%
        </span>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="btcGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.line} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors.line} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            stroke={colors.text}
            style={{ fontSize: '12px' }}
            tickLine={false}
          />
          <YAxis
            stroke={colors.text}
            style={{ fontSize: '12px' }}
            tickLine={false}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
              border: 'none',
              borderRadius: '8px',
              color: colors.text,
            }}
            formatter={(value: number) => [
              `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              'BTC 가격',
            ]}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={colors.line}
            fillOpacity={1}
            fill="url(#btcGradient)"
          />
          <Line type="monotone" dataKey="price" stroke={colors.line} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
