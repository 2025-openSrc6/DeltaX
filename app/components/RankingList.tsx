'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

// 데이터 타입
type RankingUser = {
  walletAddress: string;
  delBalance: number;
  achievementTotal: number;
  totalAsset: number;
};

export function RankingList() {
  const [ranking, setRanking] = useState<RankingUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRanking() {
      try {
        // GET /api/rankings?limit=20 호출
        const res = await fetch('/api/rankings?limit=20', {
          method: 'GET',
        });

        if (!res.ok) {
          throw new Error('랭킹 오류');
        }

        const data = await res.json();
        setRanking(data); // 받아온 배열 set
      } catch (err) {
        console.error('[RankingList] API ERROR:', err);
      } finally {
        setLoading(false);
      }
    }

    // 초기 로드
    fetchRanking();

    // 10초마다 자동 갱신
    const interval = setInterval(fetchRanking, 10000);

    // 클린업: 컴포넌트 언마운트 시 인터벌 정리
    return () => clearInterval(interval);
  }, []);

  // 로딩 화면
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-500" />
        <p className="mt-4 text-cyan-300/60 font-mono text-sm">Loading rankings...</p>
      </div>
    );
  }

  const getMedalEmoji = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return '';
  };

  return (
    <div className="space-y-3">
      {ranking.map((user, index) => (
        <div
          key={user.walletAddress}
          className={`flex items-center justify-between rounded-lg p-4 transition-all duration-300 ${
            index < 3
              ? 'bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/40 hover:border-cyan-400/60 shadow-lg shadow-cyan-500/10'
              : 'bg-slate-900/50 border border-slate-700/50 hover:border-slate-600/70'
          }`}
        >
          <div className="flex items-center gap-4">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-lg font-black text-lg ${
                index < 3
                  ? 'bg-gradient-to-br from-cyan-500 to-purple-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {getMedalEmoji(index) || index + 1}
            </span>

            <span className="font-mono text-sm text-cyan-300/90 font-semibold">
              {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-lg font-black text-cyan-300 font-mono">
              {user.totalAsset.toLocaleString()}
            </span>
            <span className="ml-1 text-xs text-cyan-400/60">DEL</span>
          </div>
        </div>
      ))}

      {ranking.length === 0 && (
        <div className="text-center py-8 text-slate-500 font-mono text-sm">
          No rankings available
        </div>
      )}
    </div>
  );
}
