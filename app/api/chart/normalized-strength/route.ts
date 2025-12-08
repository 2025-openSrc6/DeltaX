import { getDb } from '@/lib/db';
import { chartData } from '@/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { calculateAverageVolatility, createNormalizedStrengthData } from '@/lib/services/normalizedStrength';

export async function GET(request: NextRequest) {
    try {
        const db = getDb();
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || '1h';

        // 기간 계산
        const periodMs = getPeriodMs(period);
        const startTime = new Date(Date.now() - periodMs);

        // PAXG와 BTC 데이터 조회
        const [paxgData, btcData] = await Promise.all([
            db.select()
                .from(chartData)
                .where(and(
                    eq(chartData.asset, 'PAXG'),
                    gte(chartData.timestamp, startTime)
                ))
                .orderBy(chartData.timestamp),

            db.select()
                .from(chartData)
                .where(and(
                    eq(chartData.asset, 'BTC'),
                    gte(chartData.timestamp, startTime)
                ))
                .orderBy(chartData.timestamp),
        ]);

        if (paxgData.length === 0 || btcData.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'NO_DATA',
                        message: 'PAXG 또는 BTC 데이터가 부족합니다',
                    },
                },
                { status: 404 }
            );
        }

        // 시작가 (라운드 시작 시점)
        const paxgStartPrice = paxgData[0].close;
        const btcStartPrice = btcData[0].close;

        // 평균 변동성 계산 (과거 30일 데이터)
        const past30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [paxgHistorical, btcHistorical] = await Promise.all([
            db.select()
                .from(chartData)
                .where(and(
                    eq(chartData.asset, 'PAXG'),
                    gte(chartData.timestamp, past30Days)
                ))
                .orderBy(desc(chartData.timestamp))
                .limit(720), // 30일 × 24시간

            db.select()
                .from(chartData)
                .where(and(
                    eq(chartData.asset, 'BTC'),
                    gte(chartData.timestamp, past30Days)
                ))
                .orderBy(desc(chartData.timestamp))
                .limit(720),
        ]);

        const paxgAvgVol = calculateAverageVolatility(
            paxgHistorical.map(d => d.close),
            30
        );
        const btcAvgVol = calculateAverageVolatility(
            btcHistorical.map(d => d.close),
            30
        );

        // 정규화 강도 데이터 생성
        const normalizedData = [];
        const maxLength = Math.min(paxgData.length, btcData.length);

        for (let i = 0; i < maxLength; i++) {
            const paxgReturn = ((paxgData[i].close - paxgStartPrice) / paxgStartPrice) * 100;
            const btcReturn = ((btcData[i].close - btcStartPrice) / btcStartPrice) * 100;

            const dataPoint = createNormalizedStrengthData(
                paxgData[i].timestamp,
                paxgReturn,
                btcReturn,
                paxgAvgVol,
                btcAvgVol
            );

            normalizedData.push(dataPoint);
        }

        return NextResponse.json({
            success: true,
            data: {
                period,
                dataPoints: normalizedData.length,
                paxgAvgVolatility: paxgAvgVol,
                btcAvgVolatility: btcAvgVol,
                data: normalizedData.map(d => ({
                    timestamp: d.timestamp.toISOString(),
                    paxgStrength: d.paxgStrength,
                    btcStrength: d.btcStrength,
                    paxgReturn: d.paxgReturn,
                    btcReturn: d.btcReturn,
                    spread: d.spread,
                    winner: d.winner,
                })),
            },
        });
    } catch (error) {
        console.error('GET /api/chart/normalized-strength error:', error);
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'FETCH_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to fetch normalized strength data',
                },
            },
            { status: 500 }
        );
    }
}

function getPeriodMs(period: string): number {
    const periods: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
    };
    return periods[period] || periods['1h'];
}
