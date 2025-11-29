'use client';

import { useChartData } from '@/hooks/useChartData';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

/**
 * 변동성 비교 차트 Props
 */
interface VolatilityComparisonChartProps {
    /** 차트 높이 (기본: 400px) */
    height?: number;
    /** 조회 기간 */
    period?: '1h' | '24h' | '7d';
    /** 테마 */
    theme?: 'dark' | 'light';
}

/**
 * PAXG vs BTC 변동성 비교 차트
 * 
 * 두 자산의 변동성을 시계열 라인 차트로 비교합니다.
 * 어느 자산이 더 변동성이 높은지 시각적으로 확인할 수 있습니다.
 */
export function VolatilityComparisonChart({
    height = 400,
    period = '1h',
    theme = 'dark',
}: VolatilityComparisonChartProps) {
    const { data: paxgData, loading: paxgLoading } = useChartData('PAXG', period, 10000);
    const { data: btcData, loading: btcLoading } = useChartData('BTC', period, 10000);

    if (paxgLoading || btcLoading) {
        return (
            <div className="flex items-center justify-center" style={{ height }}>
                <div className="text-gray-400">로딩 중...</div>
            </div>
        );
    }

    if (!paxgData || !btcData || paxgData.length === 0 || btcData.length === 0) {
        return (
            <div className="flex items-center justify-center" style={{ height }}>
                <div className="text-gray-400">데이터 없음</div>
            </div>
        );
    }

    // 색상 설정
    const colors = {
        paxg: theme === 'dark' ? '#4ade80' : '#10b981', // 녹색
        btc: theme === 'dark' ? '#f97316' : '#ea580c', // 주황색
        text: theme === 'dark' ? '#e5e7eb' : '#374151',
        grid: theme === 'dark' ? '#374151' : '#d1d5db',
    };

    // 변동성 계산 (간단히 가격 변화율로 근사)
    const calculateVolatility = (prices: number[]) => {
        if (prices.length < 2) return 0;
        const returns = prices.slice(1).map((price, i) => Math.abs((price - prices[i]) / prices[i]) * 100);
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        return mean;
    };

    // 데이터 정합 및 변동성 계산
    const minLength = Math.min(paxgData.length, btcData.length);
    const chartData = [];

    for (let i = 0; i < minLength; i++) {
        // 최근 10개 포인트를 기준으로 변동성 계산
        const windowSize = Math.min(10, i + 1);
        const paxgPrices = paxgData.slice(Math.max(0, i - windowSize + 1), i + 1).map(d => d.close);
        const btcPrices = btcData.slice(Math.max(0, i - windowSize + 1), i + 1).map(d => d.close);

        chartData.push({
            time: paxgData[i].timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            PAXG: calculateVolatility(paxgPrices),
            BTC: calculateVolatility(btcPrices) / 20, // BTC는 스케일이 크므로 조정
        });
    }

    // 평균 변동성 계산
    const avgPaxgVol = chartData.reduce((sum, d) => sum + d.PAXG, 0) / chartData.length;
    const avgBtcVol = chartData.reduce((sum, d) => sum + d.BTC, 0) / chartData.length;
    const winner = avgPaxgVol > avgBtcVol ? 'PAXG' : 'BTC';

    return (
        <div className="w-full">
            {/* 헤더 */}
            <div className="mb-4">
                <h3 className="text-xl font-semibold" style={{ color: colors.text }}>
                    변동성 비교
                </h3>
                <div className="mt-2 flex gap-4 text-sm">
                    <div>
                        <span className="text-gray-400">PAXG 평균: </span>
                        <span style={{ color: colors.paxg }} className="font-semibold">
                            {avgPaxgVol.toFixed(3)}%
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-400">BTC 평균: </span>
                        <span style={{ color: colors.btc }} className="font-semibold">
                            {avgBtcVol.toFixed(3)}%
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-400">더 변동적: </span>
                        <span className={winner === 'PAXG' ? 'text-green-500' : 'text-orange-500'} style={{ fontWeight: 'bold' }}>
                            {winner}
                        </span>
                    </div>
                </div>
            </div>

            {/* 차트 */}
            <ResponsiveContainer width="100%" height={height}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                        label={{ value: '변동성 (%)', angle: -90, position: 'insideLeft', style: { fill: colors.text } }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            color: colors.text,
                        }}
                        formatter={(value: number, name: string) => [
                            `${value.toFixed(3)}%`,
                            name === 'PAXG' ? 'PAXG 변동성' : 'BTC 변동성 (조정)',
                        ]}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="PAXG"
                        stroke={colors.paxg}
                        strokeWidth={2}
                        dot={false}
                        name="PAXG"
                    />
                    <Line
                        type="monotone"
                        dataKey="BTC"
                        stroke={colors.btc}
                        strokeWidth={2}
                        dot={false}
                        name="BTC"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
