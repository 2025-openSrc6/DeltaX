'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 변동성 데이터 타입
 */
export interface VolatilityData {
    timestamp: Date;
    volatility: number;      // 표준편차 (변동성)
    changeRate: number;      // 변화율 (현재/평균)
    score: number;           // 변동성 점수 (0-100)
    rsi?: number;            // RSI (선택)
    atr?: number;            // ATR (선택)
}

/**
 * 변동성 데이터 조회 커스텀 훅
 * 
 * 지정된 자산의 변동성 데이터를 조회합니다.
 * 표준편차, 변화율, 점수를 포함합니다.
 * 
 * @param asset - 조회할 자산 ('PAXG' | 'BTC')
 * @param period - 조회 기간 ('1h' | '24h' | '7d')
 * @param refreshInterval - 자동 업데이트 간격 (밀리초, 기본: 60000 = 1분)
 * @returns 변동성 데이터, 로딩 상태, 에러
 * 
 * @example
 * ```tsx
 * const { data, loading } = useVolatility('PAXG', '24h');
 * 
 * // 표준편차
 * console.log(data[0].volatility);
 * 
 * // 변화율 (2.0 = 평소의 2배 변동적)
 * console.log(data[0].changeRate);
 * 
 * // 점수 (0-100)
 * console.log(data[0].score);
 * ```
 */
export function useVolatility(
    asset: 'PAXG' | 'BTC',
    period: '1h' | '24h' | '7d',
    refreshInterval: number = 60000,
) {
    const [data, setData] = useState<VolatilityData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setError(null);

            // /api/chart/historical 엔드포인트에서 변동성 데이터도 함께 조회
            const response = await fetch(`/api/chart/historical?asset=${asset}&period=${period}`);
            const result = await response.json();

            if (!result.success || !result.data) {
                throw new Error(result.error?.message || '변동성 데이터 조회 실패');
            }

            // 변동성 데이터 추출 (historical API에 포함되어 있음)
            const volatilityData: VolatilityData = {
                timestamp: new Date(result.data.timestamp),
                volatility: result.data.volatility || 0,
                changeRate: result.data.volatilityChangeRate || 1,
                score: result.data.volatilityScore || 50,
                rsi: result.data.rsi,
                atr: result.data.atr,
            };

            // 시계열 데이터로 변환 (최신 데이터 1개만 사용)
            setData([volatilityData]);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
            setError(errorMessage);
            console.error('Volatility data fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [asset, period]);

    useEffect(() => {
        fetchData();
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
