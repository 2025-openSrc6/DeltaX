'use client';

import { useVolatility } from '@/hooks/useVolatility';

/**
 * 변동성 차트 컴포넌트의 Props
 */
interface VolatilityChartProps {
  /** 조회할 자산 */
  asset: 'PAXG' | 'BTC';
  /** 차트 높이 (기본: 300px) */
  height?: number;
  /** 조회 기간 */
  period?: '1h' | '24h' | '7d';
  /** 변동성 지표 표시 여부 */
  showMetrics?: boolean;
  /** 테마 */
  theme?: 'dark' | 'light';
}

/**
 * 변동성 차트 컴포넌트
 *
 * 표준편차 기반의 변동성을 시각화합니다.
 * 변동성 점수에 따라 색상이 변경됩니다.
 *
 * @example
 * ```tsx
 * // 메인 페이지
 * <VolatilityChart asset="PAXG" height={300} showMetrics={true} />
 *
 * // 베팅 페이지 (컴팩트)
 * <VolatilityChart asset="BTC" height={200} showMetrics={false} />
 * ```
 */
export function VolatilityChart({
  asset,
  height = 300,
  period = '24h',
  showMetrics = true,
  theme = 'dark',
}: VolatilityChartProps) {
  const { data, loading, error } = useVolatility(asset, period);

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

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-gray-400">데이터 없음</div>
      </div>
    );
  }

  const currentData = data[0];
  const { volatility, changeRate, score } = currentData;

  // 변동성 점수에 따른 색상 및 레이블
  const getVolatilityLevel = (score: number) => {
    if (score < 30) return { label: '낮음', color: '#10b981', emoji: '🟢' }; // 녹색
    if (score < 70) return { label: '중간', color: '#f59e0b', emoji: '🟡' }; // 노란색
    return { label: '높음', color: '#ef4444', emoji: '🔴' }; // 빨간색
  };

  const level = getVolatilityLevel(score);
  const colors = {
    primary: level.color,
    text: theme === 'dark' ? '#e5e7eb' : '#374151',
    bg: theme === 'dark' ? '#1f2937' : '#f9fafb',
  };

  return (
    <div className="w-full">
      {/* 헤더: 변동성 레벨 */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-3xl">{level.emoji}</span>
        <div>
          <div className="text-lg font-semibold" style={{ color: colors.text }}>
            변동성: {level.label}
          </div>
          <div className="text-sm text-gray-500">
            {asset} - {period}
          </div>
        </div>
      </div>

      {/* 변동성 점수 게이지 */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm" style={{ color: colors.text }}>
            변동성 점수
          </span>
          <span className="text-2xl font-bold" style={{ color: level.color }}>
            {score.toFixed(0)}/100
          </span>
        </div>
        <div className="h-4 w-full rounded-full bg-gray-700 overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${score}%`,
              backgroundColor: level.color,
            }}
          />
        </div>
      </div>

      {/* 변동성 지표 */}
      {showMetrics && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* 표준편차 */}
          <div className="rounded-lg p-4" style={{ backgroundColor: colors.bg }}>
            <div className="text-sm text-gray-500">표준편차</div>
            <div className="mt-1 text-2xl font-bold" style={{ color: colors.text }}>
              {volatility.toFixed(2)}%
            </div>
            <div className="mt-1 text-xs text-gray-500">현재 변동성 측정값</div>
          </div>

          {/* 변화율 */}
          <div className="rounded-lg p-4" style={{ backgroundColor: colors.bg }}>
            <div className="text-sm text-gray-500">변화율</div>
            <div className="mt-1 text-2xl font-bold" style={{ color: colors.text }}>
              {changeRate.toFixed(2)}x
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {changeRate > 1
                ? '평소보다 높음 📈'
                : changeRate < 1
                  ? '평소보다 낮음 📉'
                  : '평소 수준 ➡️'}
            </div>
          </div>

          {/* RSI (있는 경우) */}
          {currentData.rsi !== undefined && (
            <div className="rounded-lg p-4" style={{ backgroundColor: colors.bg }}>
              <div className="text-sm text-gray-500">RSI</div>
              <div className="mt-1 text-2xl font-bold" style={{ color: colors.text }}>
                {currentData.rsi.toFixed(0)}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {currentData.rsi > 70
                  ? '과매수 🔴'
                  : currentData.rsi < 30
                    ? '과매도 🟢'
                    : '중립 🟡'}
              </div>
            </div>
          )}

          {/* ATR (있는 경우) */}
          {currentData.atr !== undefined && (
            <div className="rounded-lg p-4" style={{ backgroundColor: colors.bg }}>
              <div className="text-sm text-gray-500">ATR</div>
              <div className="mt-1 text-2xl font-bold" style={{ color: colors.text }}>
                {currentData.atr.toFixed(2)}
              </div>
              <div className="mt-1 text-xs text-gray-500">평균 진폭</div>
            </div>
          )}
        </div>
      )}

      {/* 설명 */}
      {showMetrics && (
        <div className="mt-4 rounded-lg bg-gray-800 p-3 text-xs text-gray-400">
          <strong>표준편차</strong>: 가격이 평균에서 얼마나 벗어나는지 측정. 높을수록 변동성이 크다.
          <br />
          <strong>변화율</strong>: 현재 변동성 ÷ 평균 변동성. 1.5x = 평소의 1.5배 변동적.
        </div>
      )}
    </div>
  );
}
