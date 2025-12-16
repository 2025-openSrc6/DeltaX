'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface PriceDataPoint {
  timestamp: string;
  paxg: number;
  btc: number;
}

interface PriceTrendChartProps {
  data: PriceDataPoint[];
}

export function PriceTrendChart({ data }: PriceTrendChartProps) {
  // Normalize data to percentage change for better comparison
  const normalizedData = normalizeToPercentage(data);

  return (
    <div className="w-full" style={{ minHeight: '400px' }}>
      <ResponsiveContainer width="100%" height={400}>
          <LineChart data={normalizedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
              }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6b7280' }} 
              tickFormatter={(value) => `${value.toFixed(1)}%`} 
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="bg-background p-3 border rounded-lg shadow-lg">
                    <p className="text-sm font-medium mb-2">
                      {new Date(payload[0].payload.timestamp).toLocaleString()}
                    </p>
                    {payload.map((entry: { dataKey: string; value: number; color: string }) => (
                      <p key={entry.dataKey} className="text-sm" style={{ color: entry.color }}>
                        {entry.dataKey === 'paxg' ? 'PAXG' : 'BTC'}: {entry.value.toFixed(2)}%
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="paxg"
              name="PAXG"
              stroke="#FFD700"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="btc"
              name="BTC"
              stroke="#F7931A"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
    </div>
  );
}

function normalizeToPercentage(data: PriceDataPoint[]): PriceDataPoint[] {
  if (data.length === 0) return [];

  const firstPoint = data[0];
  const paxgBase = firstPoint.paxg;
  const btcBase = firstPoint.btc;

  return data.map((point) => ({
    timestamp: point.timestamp,
    paxg: ((point.paxg - paxgBase) / paxgBase) * 100,
    btc: ((point.btc - btcBase) / btcBase) * 100,
  }));
}
