'use client';

import useSWR from 'swr';

// 라운드 타입
export type RoundType = '1MIN' | '6HOUR' | '1DAY';

// 라운드 상태
export type RoundStatus =
  | 'SCHEDULED'
  | 'BETTING_OPEN'
  | 'BETTING_LOCKED'
  | 'SETTLING'
  | 'SETTLED'
  | 'CANCELLED';

// 라운드 데이터 타입
export interface Round {
  id: string;
  roundNumber: number;
  type: RoundType;
  status: RoundStatus;
  startTime: number;
  endTime: number;
  lockTime: number;
  goldStartPrice?: number;
  btcStartPrice?: number;
  goldEndPrice?: number;
  btcEndPrice?: number;
  totalPool: number;
  totalGoldBets: number;
  totalBtcBets: number;
  totalBetsCount: number;
  // UI용 계산 필드
  timeRemaining?: number;
  bettingTimeRemaining?: number;
  goldBetsPercentage?: number;
  btcBetsPercentage?: number;
  canBet?: boolean;
  bettingClosesIn?: string;
}

interface CurrentRoundResponse {
  success: boolean;
  data?: Round;
  error?: { code: string; message: string };
}

const fetcher = async (url: string): Promise<Round | null> => {
  const res = await fetch(url);
  const json: CurrentRoundResponse = await res.json();

  if (!json.success || !json.data) {
    return null;
  }

  return json.data;
};

export function useCurrentRound(type: RoundType = '1MIN', refreshInterval: number = 5000) {
  const { data, error, isLoading, mutate } = useSWR<Round | null>(
    `/api/rounds/current?type=${type}`,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
    },
  );

  return {
    round: data,
    isLoading,
    error: error?.message || null,
    refetch: mutate,
    // 편의 속성
    canBet: data?.canBet ?? false,
    status: data?.status,
    timeRemaining: data?.timeRemaining ?? 0,
    bettingTimeRemaining: data?.bettingTimeRemaining ?? 0,
    totalPool: data?.totalPool ?? 0,
    goldPercentage: data?.goldBetsPercentage ?? 50,
    btcPercentage: data?.btcBetsPercentage ?? 50,
  };
}
