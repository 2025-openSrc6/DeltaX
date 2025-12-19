'use client';

import useSWR from 'swr';

// 베팅 예측 타입
export type Prediction = 'GOLD' | 'BTC';

// 베팅 결과 상태
export type ResultStatus = 'PENDING' | 'WON' | 'LOST' | 'REFUNDED' | 'FAILED';

// 정산 상태
export type SettlementStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

// 베팅 데이터 타입
export interface Bet {
  id: string;
  roundId: string;
  userId: string;
  prediction: Prediction;
  amount: number;
  currency: 'DEL' | 'CRYSTAL';
  resultStatus: ResultStatus;
  settlementStatus: SettlementStatus;
  payoutAmount?: number;
  suiBetObjectId?: string;
  suiTxHash?: string;
  createdAt: number;
  settledAt?: number;
}

// 페이지네이션 메타
interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface MyBetsResponse {
  success: boolean;
  data?: Bet[];
  meta?: PaginationMeta;
  error?: { code: string; message: string };
}

interface UseMyBetsParams {
  roundId?: string;
  prediction?: Prediction;
  resultStatus?: ResultStatus;
  page?: number;
  pageSize?: number;
}

const fetcher = async (url: string): Promise<{ bets: Bet[]; meta: PaginationMeta }> => {
  const res = await fetch(url);
  const json: MyBetsResponse = await res.json();

  if (!json.success) {
    throw new Error(json.error?.message || 'Failed to fetch bets');
  }

  return {
    bets: json.data || [],
    meta: json.meta || { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
};

export function useMyBets(params: UseMyBetsParams = {}, refreshInterval: number = 10000) {
  const { roundId, prediction, resultStatus, page = 1, pageSize = 20 } = params;

  // URL 파라미터 구성
  const searchParams = new URLSearchParams();
  if (roundId) searchParams.set('roundId', roundId);
  if (prediction) searchParams.set('prediction', prediction);
  if (resultStatus) searchParams.set('resultStatus', resultStatus);
  searchParams.set('page', page.toString());
  searchParams.set('pageSize', pageSize.toString());

  const url = `/api/me/bets?${searchParams.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<{ bets: Bet[]; meta: PaginationMeta }>(
    url,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
    },
  );

  return {
    bets: data?.bets || [],
    meta: data?.meta,
    isLoading,
    error: error?.message || null,
    refetch: mutate,
    // 편의 속성
    hasBets: (data?.bets?.length ?? 0) > 0,
    totalBets: data?.meta?.total ?? 0,
  };
}
