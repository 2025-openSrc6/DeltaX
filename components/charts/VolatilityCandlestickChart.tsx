'use client';

import { useChartData } from '@/hooks/useChartData';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

/**
 * 변동성 캔들스틱 차트 Props
 */
interface VolatilityCandlestickChartProps {
    /** 조회할 자산 */
    asset: 'PAXG' | 'BTC';
    /** 차트 높이 (기본: 400px) */
    height?: number;
    /** 조회 기간 */
    period?: '1h' | '24h' | '7d';
    /** 테마 */
    theme?: 'dark' | 'light';
    /** 업데이트 간격 (밀리초) */
    refreshInterval?: number;
}

/**
 * 변동성 캔들스틱 차트
 * 
 * PAXG/BTC의 "변동성의 변동성"을 캔들스틱(양봉/음봉)으로 시각화합니다.
 * - 양봉(초록): 변동성이 증가하는 구간 (변동성의 변동성 ↑)
 * - 음봉(빨강): 변동성이 감소하는 구간 (변동성의 변동성 ↓)
 * 
 * 이 프로젝트의 핵심 차트입니다!
 */
export function VolatilityCandlestickChart({
    asset,
    height = 400,
    period = '1h',
    theme = 'dark',
    refreshInterval = 10000,
}: VolatilityCandlestickChartProps) {
    const { data, loading, error } = useChartData(asset, period, refreshInterval);

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

    if (!data || data.length < 2) {
        return (
            <div className="flex items-center justify-center" style={{ height }}>
                <div className="text-gray-400">데이터 부족 (최소 2개 필요)</div>
            </div>
        );
    }

    // 색상 설정
    const colors = {
        bullish: '#10b981', // 양봉 (초록)
        bearish: '#ef4444', // 음봉 (빨강)
        text: theme === 'dark' ? '#e5e7eb' : '#374151',
    };

    /**
     * 변동성 계산 함수
     * 최근 N개 가격의 표준편차를 계산합니다.
     */
    const calculateVolatility = (prices: number[], windowSize: number = 10): number => {
        if (prices.length < 2) return 0;
        const window = prices.slice(-windowSize);
        const mean = window.reduce((sum, p) => sum + p, 0) / window.length;
        const variance = window.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / window.length;
        return Math.sqrt(variance);
    };

    /**
     * 캔들스틱 데이터 생성
     * 각 시점의 변동성과 이전 대비 변화를 계산합니다.
     */
    const candlestickData = [];
    const volatilities: number[] = [];

    // 1단계: 각 시점의 변동성 계산
    for (let i = 0; i < data.length; i++) {
        const windowSize = Math.min(10, i + 1);
        const prices = data.slice(Math.max(0, i - windowSize + 1), i + 1).map(d => d.close);
        const volatility = calculateVolatility(prices, windowSize);
        volatilities.push(volatility);
    }

    // 2단계: 변동성의 변화를 캔들스틱으로 표현
    for (let i = 5; i < volatilities.length; i++) {
        const currentVol = volatilities[i];
        const previousVol = volatilities[i - 1];

        // 변동성 변화율 계산
        const changeRate = previousVol !== 0 ? ((currentVol - previousVol) / previousVol) * 100 : 0;

        // 양봉/음봉 판단
        const isBullish = currentVol > previousVol;

        candlestickData.push({
            time: data[i].timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            volatility: currentVol,
            previousVol: previousVol,
            change: currentVol - previousVol,
            changeRate: changeRate,
            isBullish: isBullish,
            color: isBullish ? colors.bullish : colors.bearish,
        });
    }

    // 통계 계산
    const avgVolatility = volatilities.reduce((sum, v) => sum + v, 0) / volatilities.length;
    const bullishCount = candlestickData.filter(d => d.isBullish).length;
    const bearishCount = candlestickData.length - bullishCount;
    const bullishRatio = (bullishCount / candlestickData.length) * 100;

    return (
        <div className="w-full">
            {/* 헤더 */}
            <div className="mb-4">
                <h3 className="text-xl font-semibold" style={{ color: colors.text }}>
                    {asset} 변동성 캔들스틱 차트
                </h3>
                <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
                    <div>
                        <span className="text-gray-400">평균 변동성: </span>
                        <span style={{ color: colors.text }} className="font-semibold">
                            {avgVolatility.toFixed(3)}
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-400">양봉: </span>
                        <span style={{ color: colors.bullish }} className="font-semibold">
                            {bullishCount}개 ({bullishRatio.toFixed(1)}%)
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-400">음봉: </span>
                        <span style={{ color: colors.bearish }} className="font-semibold">
                            {bearishCount}개 ({(100 - bullishRatio).toFixed(1)}%)
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-400">추세: </span>
                        <span style={{ color: bullishRatio > 50 ? colors.bullish : colors.bearish }} className="font-bold">
                            {bullishRatio > 50 ? '📈 변동성 증가' : '📉 변동성 감소'}
                        </span>
                    </div>
                </div>
            </div>

            {/* 차트 */}
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={candlestickData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <XAxis
                        dataKey="time"
                        stroke={colors.text}
                        style={{ fontSize: '12px' }}
                        tickLine={false}
                        interval={Math.floor(candlestickData.length / 10)}
                    />
                    <YAxis
                        stroke={colors.text}
                        style={{ fontSize: '12px' }}
                        tickLine={false}
                        label={{
                            value: '변동성',
                            angle: -90,
                            position: 'insideLeft',
                            style: { fill: colors.text }
                        }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            color: colors.text,
                        }}
                        content={({ active, payload }) => {
                            if (!active || !payload || !payload[0]) return null;
                            const data = payload[0].payload;
                            return (
                                <div className="p-3 rounded-lg" style={{
                                    backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                                    color: colors.text
                                }}>
                                    <div className="text-xs text-gray-400 mb-1">{data.time}</div>
                                    <div className="font-semibold" style={{ color: data.color }}>
                                        {data.isBullish ? '📈 양봉' : '📉 음봉'}
                                    </div>
                                    <div className="mt-1 text-sm">
                                        변동성: <strong>{data.volatility.toFixed(3)}</strong>
                                    </div>
                                    <div className="text-sm">
                                        변화: <strong style={{ color: data.color }}>
                                            {data.change > 0 ? '+' : ''}{data.change.toFixed(3)}
                                        </strong>
                                    </div>
                                    <div className="text-sm">
                                        변화율: <strong style={{ color: data.color }}>
                                            {data.changeRate > 0 ? '+' : ''}{data.changeRate.toFixed(2)}%
                                        </strong>
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <Bar dataKey="volatility" radius={[4, 4, 0, 0]}>
                        {candlestickData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>

            {/* 설명 */}
            <div className="mt-4 rounded-lg bg-gray-800 p-3 text-xs text-gray-400">
                <strong>📊 캔들스틱 차트 해석:</strong>
                <br />
                <span style={{ color: colors.bullish }}>● 양봉(초록)</span>: 변동성이 증가하는 구간 → 가격이 더 불안정해짐
                <br />
                <span style={{ color: colors.bearish }}>● 음봉(빨강)</span>: 변동성이 감소하는 구간 → 가격이 안정화됨
                <br />
                <br />
                <strong>💡 이 프로젝트의 핵심:</strong> 변동성의 변동성을 추적하여 시장의 불확실성을 측정합니다.
            </div>
        </div>
    );
}
