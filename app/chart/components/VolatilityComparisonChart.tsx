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
    <div className="w-full">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-cyan-800 mb-1">Volatility Comparison</h3>
        <p className="text-sm text-cyan-600">
          Compare volatility, return, and volatility-adjusted return
        </p>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis 
            dataKey="metric" 
            tick={{ fontSize: 12, fill: '#64748b' }} 
          />
          <YAxis 
            tick={{ fontSize: 12, fill: '#64748b' }} 
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              color: '#1e293b',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              return (
                <div className="p-3">
                  <p className="text-sm font-medium mb-2 text-slate-700">{payload[0].payload.metric}</p>
                  {payload.map((entry: { dataKey: string; value: number; color: string }) => (
                    <p key={entry.dataKey} className="text-sm text-slate-700" style={{ color: entry.color }}>
                      {entry.dataKey}: {entry.value.toFixed(2)}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="square"
          />
          <Bar dataKey={data.asset1.name} fill="#FFD700" />
          <Bar dataKey={data.asset2.name} fill="#F7931A" />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
        <div>
          <div className="text-cyan-700 mb-1 font-semibold">Volatility</div>
          <div className="text-xs text-cyan-600">Risk level (Std Dev)</div>
        </div>
        <div>
          <div className="text-cyan-700 mb-1 font-semibold">Return (%)</div>
          <div className="text-xs text-cyan-600">Price change</div>
        </div>
        <div>
          <div className="text-cyan-700 mb-1 font-semibold">Adj. Return</div>
          <div className="text-xs text-cyan-600">Return per unit risk</div>
        </div>
      </div>
    </div>
  );
}
