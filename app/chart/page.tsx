'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PriceTrendChart } from './components/PriceTrendChart';
import { VolatilityComparisonChart } from './components/VolatilityComparisonChart';

interface ComparisonData {
  asset1: {
    name: string;
    volatility: number;
    return: number;
    adjustedReturn: number;
    currentPrice: number;
    startPrice: number;
    dataPoints: number;
  };
  asset2: {
    name: string;
    volatility: number;
    return: number;
    adjustedReturn: number;
    currentPrice: number;
    startPrice: number;
    dataPoints: number;
  };
  comparison: {
    winner: string;
    confidence: number;
    difference: number;
    interpretation: string;
  };
  period: string;
  timestamp: string;
}

interface HistoricalDataPoint {
  timestamp: string;
  close: number;
}

export default function ChartPage() {
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [historicalPaxg, setHistoricalPaxg] = useState<HistoricalDataPoint[]>([]);
  const [historicalBtc, setHistoricalBtc] = useState<HistoricalDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllData();
    // 30초마다 자동 업데이트
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAllData() {
    try {
      setLoading(true);

      // 비교 데이터와 히스토리컬 데이터를 병렬로 조회
      const [comparisonRes, paxgRes, btcRes] = await Promise.all([
        fetch('/api/chart/compare?asset1=PAXG&asset2=BTC&period=24h'),
        fetch('/api/chart/historical?asset=PAXG&period=24h'),
        fetch('/api/chart/historical?asset=BTC&period=24h'),
      ]);

      const comparisonResult = await comparisonRes.json();
      const paxgResult = await paxgRes.json();
      const btcResult = await btcRes.json();

      if (comparisonResult.success) {
        setComparisonData(comparisonResult.data);
      }

      if (paxgResult.success) {
        setHistoricalPaxg(paxgResult.data.data);
      }

      if (btcResult.success) {
        setHistoricalBtc(btcResult.data.data);
      }

      setError(null);
    } catch (err) {
      setError('Failed to fetch data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // 차트용 데이터 변환
  const priceChartData = historicalPaxg.map((paxgPoint, index) => {
    const btcPoint = historicalBtc[index];
    return {
      timestamp: paxgPoint.timestamp,
      paxg: paxgPoint.close,
      btc: btcPoint ? btcPoint.close : 0,
    };
  });

  if (loading && !comparisonData) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!comparisonData) {
    return null;
  }

  const { asset1, asset2, comparison } = comparisonData;

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">DeltaX Chart Analysis</h1>
        <p className="text-muted-foreground">
          Compare volatility-adjusted returns: {asset1.name} vs {asset2.name}
        </p>
      </div>

      {/* 전체 비교 결과 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>Comparison Result</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-primary/10 rounded-lg">
              <div className="text-sm font-medium mb-1">Winner</div>
              <div className="text-3xl font-bold text-primary">{comparison.winner}</div>
              <div className="text-sm text-muted-foreground mt-2">{comparison.interpretation}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Confidence</div>
                <div className="text-2xl font-bold">{(comparison.confidence * 100).toFixed(0)}%</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Difference</div>
                <div className="text-2xl font-bold">{comparison.difference.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 차트 시각화 */}
      {priceChartData.length > 1 && (
        <>
          <PriceTrendChart data={priceChartData} />
          <VolatilityComparisonChart data={{ asset1, asset2 }} />
        </>
      )}

      {/* 개별 자산 비교 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PAXG 카드 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-yellow-600">{asset1.name} (Gold)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Current Price</span>
                <span className="font-medium">${asset1.currentPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span>Start Price</span>
                <span className="font-medium">${asset1.startPrice.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Volatility (Std Dev)</span>
                <span className="font-medium">{asset1.volatility.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-600"
                  style={{ width: `${Math.min((asset1.volatility / 10) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Return (%)</span>
                <span
                  className={`font-medium ${
                    asset1.return >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {asset1.return >= 0 ? '+' : ''}
                  {asset1.return.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
              <div className="text-sm font-medium mb-1">Volatility-Adjusted Return</div>
              <div className="text-2xl font-bold text-yellow-600">
                {asset1.adjustedReturn.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Higher is better</div>
            </div>

            <div className="text-xs text-muted-foreground">
              Data points: {asset1.dataPoints}
            </div>
          </CardContent>
        </Card>

        {/* BTC 카드 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-orange-600">{asset2.name} (Bitcoin)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Current Price</span>
                <span className="font-medium">${asset2.currentPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span>Start Price</span>
                <span className="font-medium">${asset2.startPrice.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Volatility (Std Dev)</span>
                <span className="font-medium">{asset2.volatility.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-600"
                  style={{ width: `${Math.min((asset2.volatility / 500) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Return (%)</span>
                <span
                  className={`font-medium ${
                    asset2.return >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {asset2.return >= 0 ? '+' : ''}
                  {asset2.return.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
              <div className="text-sm font-medium mb-1">Volatility-Adjusted Return</div>
              <div className="text-2xl font-bold text-orange-600">
                {asset2.adjustedReturn.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Higher is better</div>
            </div>

            <div className="text-xs text-muted-foreground">
              Data points: {asset2.dataPoints}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 설명 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>What is Volatility-Adjusted Return?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Volatility-Adjusted Return</strong> measures how much return you get per unit
            of risk (volatility).
          </p>
          <p>
            <strong>Formula:</strong> Return (%) ÷ Volatility (Standard Deviation)
          </p>
          <p>
            <strong>Interpretation:</strong> A higher value means the asset provides better returns
            for the same level of risk. This helps you compare assets with different volatility
            levels fairly.
          </p>
          <p className="text-xs">
            Last updated: {new Date(comparisonData.timestamp).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
