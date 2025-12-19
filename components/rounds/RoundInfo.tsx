'use client';

import { useCurrentRound, RoundType, RoundStatus } from '@/hooks/useCurrentRound';
import { useEffect, useState } from 'react';

interface RoundInfoProps {
  type?: RoundType;
}

// 상태에 따른 스타일
const getStatusStyle = (status?: RoundStatus) => {
  switch (status) {
    case 'BETTING_OPEN':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'BETTING_LOCKED':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'SETTLING':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'SETTLED':
      return 'bg-stone-100 text-stone-600 border-stone-200';
    default:
      return 'bg-stone-100 text-stone-500 border-stone-200';
  }
};

// 상태 한글 변환
const getStatusLabel = (status?: RoundStatus) => {
  switch (status) {
    case 'SCHEDULED':
      return '예정';
    case 'BETTING_OPEN':
      return '베팅 가능';
    case 'BETTING_LOCKED':
      return '베팅 마감';
    case 'SETTLING':
      return '정산중';
    case 'SETTLED':
      return '정산 완료';
    case 'CANCELLED':
      return '취소됨';
    default:
      return '로딩중...';
  }
};

// 시간 포맷팅 (초 → MM:SS)
const formatTime = (seconds: number): string => {
  if (seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export function RoundInfo({ type = '1MIN' }: RoundInfoProps) {
  const {
    round,
    isLoading,
    canBet,
    status,
    bettingTimeRemaining,
    totalPool,
    goldPercentage,
    btcPercentage,
  } = useCurrentRound(type);

  // 로컬 카운트다운 (부드러운 UI)
  const [localBettingTime, setLocalBettingTime] = useState(bettingTimeRemaining);

  useEffect(() => {
    setLocalBettingTime(bettingTimeRemaining);
  }, [bettingTimeRemaining]);

  useEffect(() => {
    if (localBettingTime <= 0) return;

    const timer = setInterval(() => {
      setLocalBettingTime((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [localBettingTime]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-6 animate-pulse">
        <div className="h-6 bg-stone-200 rounded w-1/2 mb-4"></div>
        <div className="h-4 bg-stone-100 rounded w-1/3"></div>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="bg-stone-50 rounded-lg border border-stone-200 p-6 text-center">
        <p className="text-stone-500">현재 진행중인 라운드가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-stone-200 bg-gradient-to-r from-stone-50 to-amber-50">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-stone-800">라운드 #{round.roundNumber}</h3>
            <span
              className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusStyle(status)}`}
            >
              {getStatusLabel(status)}
            </span>
          </div>

          {/* 타이머 */}
          {canBet && (
            <div className="text-right">
              <p className="text-xs text-stone-500">베팅 마감까지</p>
              <p className="text-2xl font-bold text-amber-600 font-mono">
                {formatTime(localBettingTime)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 풀 정보 */}
      <div className="px-6 py-4">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-stone-600">총 베팅 풀</span>
          <span className="font-semibold text-stone-800">{totalPool.toLocaleString()} DEL</span>
        </div>

        {/* 베팅 비율 바 */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-yellow-600 font-medium">금 {goldPercentage}%</span>
            <span className="text-orange-600 font-medium">BTC {btcPercentage}%</span>
          </div>
          <div className="h-3 bg-stone-100 rounded-full overflow-hidden flex">
            <div
              className="bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-500"
              style={{ width: `${goldPercentage}%` }}
            />
            <div
              className="bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500"
              style={{ width: `${btcPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
