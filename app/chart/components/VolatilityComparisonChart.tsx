'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VolatilityData {
  asset1: {
    name: string;
    volatility: number;
    return: number;
    adjustedReturn: number;
  };
  asset2: {
    name: string;
    volatility: number;
    return: number;
    adjustedReturn: number;
  };
}

interface VolatilityComparisonChartProps {
  data: VolatilityData;
}

export function VolatilityComparisonChart({ data }: VolatilityComparisonChartProps) {
  const chartData = [
    {
      metric: 'Volatility',
      [data.asset1.name]: data.asset1.volatility,
      [data.asset2.name]: data.asset2.volatility,
    },
    {
      metric: 'Return (%)',
      [data.asset1.name]: data.asset1.return,
      [data.asset2.name]: data.asset2.return,
    },
    {
      metric: 'Adj. Return',
      [data.asset1.name]: data.asset1.adjustedReturn,
      [data.asset2.name]: data.asset2.adjustedReturn,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Volatility Comparison</CardTitle>
        <p className="text-sm text-muted-foreground">
          Compare volatility, return, and volatility-adjusted return
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="bg-background p-3 border rounded-lg shadow-lg">
                    <p className="text-sm font-medium mb-2">{payload[0].payload.metric}</p>
                    {payload.map((entry: { dataKey: string; value: number; color: string }) => (
                      <p key={entry.dataKey} className="text-sm" style={{ color: entry.color }}>
                        {entry.dataKey}: {entry.value.toFixed(2)}
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Legend />
            <Bar dataKey={data.asset1.name} fill="#FFD700" />
            <Bar dataKey={data.asset2.name} fill="#F7931A" />
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
          <div>
            <div className="text-muted-foreground mb-1">Volatility</div>
            <div className="text-xs text-muted-foreground">Risk level (Std Dev)</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Return (%)</div>
            <div className="text-xs text-muted-foreground">Price change</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Adj. Return</div>
            <div className="text-xs text-muted-foreground">Return per unit risk</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
