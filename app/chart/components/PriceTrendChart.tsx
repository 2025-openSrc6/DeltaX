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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <Card>
      <CardHeader>
        <CardTitle>Price Trend (Normalized to %)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Starting from 0%, showing relative price changes
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={normalizedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
              }}
            />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${value.toFixed(1)}%`} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="bg-background p-3 border rounded-lg shadow-lg">
                    <p className="text-sm font-medium mb-2">
                      {new Date(payload[0].payload.timestamp).toLocaleString()}
                    </p>
                    {payload.map((entry: any) => (
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
      </CardContent>
    </Card>
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
