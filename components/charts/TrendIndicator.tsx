'use client';

/**
 * 상승/하락 표시 컴포넌트의 Props
 */
interface TrendIndicatorProps {
  /** 현재 가격 */
  current: number;
  /** 이전 가격 (비교 기준) */
  previous: number;
  /** 퍼센트 변화 표시 여부 (기본: true) */
  showPercentage?: boolean;
  /** 크기 */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 가격 상승/하락/보합 표시 컴포넌트
 *
 * 현재 가격과 이전 가격을 비교하여 상승, 하락, 보합을 시각적으로 표시합니다.
 *
 * @example
 * ```tsx
 * // 상승
 * <TrendIndicator current={100} previous={95} />
 * // → 📈 +5.26% (초록색)
 *
 * // 하락
 * <TrendIndicator current={90} previous={100} />
 * // → 📉 -10.00% (빨간색)
 *
 * // 보합
 * <TrendIndicator current={100} previous={100} />
 * // → ➡️ 0.00% (회색)
 * ```
 */
export function TrendIndicator({
  current,
  previous,
  showPercentage = true,
  size = 'md',
}: TrendIndicatorProps) {
  // 변화율 계산
  const change = current - previous;
  const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

  // 상승/하락/보합 판단
  const isUp = change > 0;
  const isDown = change < 0;
  const isFlat = change === 0;

  // 아이콘 선택
  const icon = isUp ? '📈' : isDown ? '📉' : '➡️';

  // 색상 선택
  const colorClass = isUp ? 'text-green-500' : isDown ? 'text-red-500' : 'text-gray-500';

  // 크기 선택
  const sizeClass = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }[size];

  return (
    <span className={`inline-flex items-center gap-1 ${sizeClass} ${colorClass} font-semibold`}>
      <span>{icon}</span>
      {showPercentage && (
        <span>
          {isUp && '+'}
          {changePercent.toFixed(2)}%
        </span>
      )}
    </span>
  );
}
