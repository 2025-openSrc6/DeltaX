'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

// 데이터 타입
type RankingUser = {
  walletAddress: string;
  nickname: string | null;
  nicknameColor: string | null;
  profileColor: string | null;
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
        <p className="mt-4 text-cyan-600 font-mono text-sm">Loading rankings...</p>
      </div>
    );
  }

  const getMedalEmoji = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return '';
  };

  // 닉네임 색상 스타일 생성
  const getNicknameStyle = (nicknameColor: string | null, profileColor: string | null) => {
    const color = nicknameColor || profileColor || null;
    if (!color) return {};

    // RAINBOW인 경우 그라디언트 적용
    if (color === 'RAINBOW') {
      return {
        background:
          'linear-gradient(to right, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      };
    }

    // 일반 색상인 경우
    return {
      color: color,
      textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
    };
  };

  return (
    <div className="space-y-3">
      {ranking.map((user, index) => (
        <div
          key={user.walletAddress}
          className={`flex items-center justify-between rounded-lg p-4 transition-all duration-300 ${
            index < 3
              ? 'bg-gradient-to-r from-cyan-50 to-purple-50 border border-cyan-300 hover:border-cyan-400 shadow-lg shadow-cyan-200/50'
              : 'bg-white/90 border border-cyan-200 hover:border-cyan-300 shadow-md shadow-cyan-100/30'
          }`}
        >
          <div className="flex items-center gap-4">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-lg font-black text-lg ${
                index < 3
                  ? 'bg-gradient-to-br from-cyan-500 to-purple-600 text-white shadow-lg shadow-cyan-300/50'
                  : 'bg-gradient-to-br from-cyan-400 to-purple-500 text-white shadow-md shadow-cyan-200/30'
              }`}
            >
              {getMedalEmoji(index) || index + 1}
            </span>

            <span
              className="font-semibold text-sm"
              style={getNicknameStyle(user.nicknameColor, user.profileColor)}
            >
              {user.nickname ||
                `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`}
            </span>
          </div>

          <div className="text-right">
            <span className="text-lg font-black text-cyan-700 font-mono">
              {user.totalAsset.toLocaleString()}
            </span>
            <span className="ml-1 text-xs text-cyan-600/70">DEL</span>
          </div>
        </div>
      ))}

      {ranking.length === 0 && (
        <div className="text-center py-8 text-cyan-600 font-mono text-sm">
          No rankings available
        </div>
      )}
    </div>
  );
}
