'use client';

import { useState } from 'react';

interface CollectResult {
  success: boolean;
  data?: {
    collected: Record<string, { chartData: string; volatilitySnapshot: string }>;
    timestamp: string;
  };
  error?: { code: string; message: string };
}

interface LatestData {
  asset: string;
  data: {
    id: string;
    asset: string;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    volatility: number;
    averageVolatility: number;
    volatilityChangeRate: number;
    volatilityScore: number;
    movementIntensity: number;
    trendStrength: number;
    relativePosition: number;
    rsi: number;
  } | null;
}

export default function ChartTestPage() {
  const [collectResult, setCollectResult] = useState<CollectResult | null>(null);
  const [latestData, setLatestData] = useState<LatestData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCollect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/chart/collect', { method: 'POST' });
      const data = await res.json();
      setCollectResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Collection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchLatest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/chart/collect');
      const data = await res.json();
      if (data.success) {
        setLatestData(data.data.latest);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Chart Data Collection Test</h1>

      <div className="flex gap-4 mb-8">
        <button
          onClick={handleCollect}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Collecting...' : 'Collect Data (POST)'}
        </button>
        <button
          onClick={handleFetchLatest}
          disabled={loading}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Fetching...' : 'Get Latest (GET)'}
        </button>
      </div>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg mb-4">{error}</div>}

      {collectResult && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Collection Result</h2>
          <pre className="p-4 bg-gray-100 rounded-lg overflow-auto text-sm">
            {JSON.stringify(collectResult, null, 2)}
          </pre>
        </div>
      )}

      {latestData.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Latest Data</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {latestData.map(({ asset, data }) => (
              <div key={asset} className="p-6 border rounded-lg">
                <h3 className="text-lg font-bold mb-4">{asset}</h3>
                {data ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Price:</span>
                      <span className="font-mono">${data.close.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Volume:</span>
                      <span className="font-mono">{data.volume.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Volatility:</span>
                      <span className="font-mono">{data.volatility.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg Volatility:</span>
                      <span className="font-mono">{data.averageVolatility.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">Volatility Change Rate:</span>
                      <span className="font-mono font-bold text-blue-600">
                        {data.volatilityChangeRate.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Volatility Score:</span>
                      <span className="font-mono">{data.volatilityScore.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>RSI:</span>
                      <span className="font-mono">{data.rsi.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Movement Intensity:</span>
                      <span className="font-mono">{data.movementIntensity.toFixed(4)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Trend Strength:</span>
                      <span className="font-mono">{data.trendStrength.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Relative Position:</span>
                      <span className="font-mono">{data.relativePosition.toFixed(2)}%</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-4">
                      Timestamp: {new Date(data.timestamp).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500">No data available</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
