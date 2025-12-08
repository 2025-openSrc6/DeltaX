'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 자동 데이터 수집 상태
 */
export interface AutoCollectStatus {
  isRunning: boolean;
  lastCollected: Date | null;
  collectCount: number;
  error: string | null;
}

/**
 * 자동 차트 데이터 수집 커스텀 훅
 *
 * 지정된 간격으로 Binance API에서 가격 데이터를 조회하여 DB에 저장합니다.
 * 어느 페이지에서든 이 훅을 호출하면 자동으로 백그라운드 데이터 수집이 시작됩니다.
 *
 * @param interval - 데이터 수집 간격 (밀리초, 기본: 5000 = 5초)
 * @param enabled - 자동 수집 활성화 여부 (기본: true)
 * @returns 수집 상태 및 수동 제어 함수
 *
 * @example
 * ```tsx
 * // 기본 사용 (5초마다 자동 수집)
 * const { status } = useAutoCollect();
 *
 * // 10초 간격으로 수집
 * const { status } = useAutoCollect(10000);
 *
 * // 조건부 활성화
 * const { status, start, stop } = useAutoCollect(5000, isChartPage);
 *
 * // 수동 제어
 * <button onClick={start}>시작</button>
 * <button onClick={stop}>중지</button>
 * ```
 */
export function useAutoCollect(interval: number = 5000, enabled: boolean = true) {
  const [status, setStatus] = useState<AutoCollectStatus>({
    isRunning: false,
    lastCollected: null,
    collectCount: 0,
    error: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isEnabledRef = useRef(enabled);

  // enabled 상태를 ref로 관리 (useEffect 의존성 문제 방지)
  useEffect(() => {
    isEnabledRef.current = enabled;
  }, [enabled]);

  const collect = async () => {
    try {
      const response = await fetch('/api/chart/collect', { method: 'POST' });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || '데이터 수집 실패');
      }

      setStatus((prev) => ({
        isRunning: true,
        lastCollected: new Date(),
        collectCount: prev.collectCount + 1,
        error: null,
      }));

      console.log('[AutoCollect] Data collected successfully', {
        timestamp: new Date().toISOString(),
        count: status.collectCount + 1,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setStatus((prev) => ({
        ...prev,
        isRunning: true,
        error: errorMessage,
      }));
      console.error('[AutoCollect] Failed to collect data:', err);
    }
  };

  const start = () => {
    if (intervalRef.current) return; // 이미 실행 중

    console.log(`[AutoCollect] Starting with ${interval}ms interval`);

    // 즉시 한 번 수집
    collect();

    // 주기적 수집 시작
    intervalRef.current = setInterval(collect, interval);
    setStatus((prev) => ({ ...prev, isRunning: true }));
  };

  const stop = () => {
    console.log('[AutoCollect] Stopping');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus((prev) => ({ ...prev, isRunning: false }));
  };

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }

    // Cleanup: 컴포넌트 unmount 시 자동으로 중지
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval]);

  return {
    status,
    start,
    stop,
    collect, // 수동 수집 함수
  };
}
