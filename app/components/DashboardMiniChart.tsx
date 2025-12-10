'use client';

import { Card } from '@/components/ui/card';

export function DashboardMiniChart() {
  return (
    <div className="rounded-xl bg-gradient-to-br from-slate-900/50 to-slate-950/50 border border-cyan-500/20 p-6">
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-cyan-400 font-semibold mb-1">BTC vs GOLD</p>
          <h3 className="text-lg font-black text-cyan-300">Price Movement</h3>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-900/70 p-1 border border-slate-700/50">
          <button className="rounded-md bg-gradient-to-r from-cyan-500 to-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
            6H
          </button>
          <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-cyan-300 transition-colors">
            1D
          </button>
          <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-cyan-300 transition-colors">
            7D
          </button>
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="relative h-48 overflow-hidden rounded-lg bg-gradient-to-b from-cyan-500/5 to-transparent border border-cyan-500/10">
        {/* 그리드 라인 */}
        <div className="absolute inset-0">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-cyan-500/10"
              style={{ top: `${i * 25}%` }}
            />
          ))}
        </div>

        {/* BTC 라인 (cyan) */}
        <svg className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="btcGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(6,182,212,0.4)" />
              <stop offset="100%" stopColor="rgba(6,182,212,0)" />
            </linearGradient>
          </defs>
          <polyline
            fill="url(#btcGradient)"
            stroke="rgba(6,182,212,1)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,180 50,150 100,165 150,110 200,120 250,80 300,90 350,70 400,85"
          />
        </svg>

        {/* GOLD 라인 (yellow) */}
        <svg className="absolute inset-0 h-full w-full">
          <polyline
            fill="none"
            stroke="rgba(234,179,8,0.9)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5,5"
            points="0,140 50,135 100,145 150,125 200,140 250,115 300,120 350,110 400,125"
          />
        </svg>
      </div>

      {/* 하단 정보 */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-cyan-400/70 font-mono">Next update in 3m 41s</p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" />
            <span className="text-xs font-bold text-cyan-300">BTC</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-lg shadow-amber-400/50" />
            <span className="text-xs font-bold text-amber-300">GOLD</span>
          </div>
        </div>
      </div>
    </div>
  );
}
