'use client';

import { useSuiClientQuery } from '@mysten/dapp-kit';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useCallback, useMemo } from 'react';
import { selectCoinsForAmount } from '@/lib/shared/coinSelection';

// DEL 토큰의 Coin Type (환경변수에서 가져올 수 없으므로 API 호출 필요)
// 프론트엔드에서는 NEXT_PUBLIC_ prefix가 필요함
const DEL_COIN_TYPE = process.env.NEXT_PUBLIC_SUI_DEL_COIN_TYPE || '';

interface DelCoin {
  coinObjectId: string;
  balance: string;
}

export function useDelCoins() {
  const account = useCurrentAccount();

  const { data, isLoading, error, refetch } = useSuiClientQuery(
    'getCoins',
    {
      owner: account?.address || '',
      coinType: DEL_COIN_TYPE,
    },
    {
      enabled: !!account?.address && !!DEL_COIN_TYPE,
    },
  );

  // 코인 목록을 간단한 형태로 변환 (useMemo로 참조 안정성 확보)
  const coins = useMemo<DelCoin[]>(
    () =>
      data?.data?.map((coin) => ({
        coinObjectId: coin.coinObjectId,
        balance: coin.balance,
      })) || [],
    [data?.data],
  );

  // 전체 잔액 계산
  const totalBalance = coins.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));

  // 첫 번째 코인 (베팅에 사용할 코인)
  const primaryCoin = coins[0] || null;

  /**
   * 베팅에 필요한 코인들을 자동 선택
   *
   * - 단일 코인으로 충분하면 그것만 반환 (merge 불필요)
   * - 부족하면 큰 순서대로 필요한 만큼만 선택 (최소 merge)
   *
   * @param amountDel - 베팅 금액 (DEL 단위)
   * @returns 선택된 코인 ID 배열
   * @throws Error - 잔액 부족 시
   */
  const selectCoinsForBet = useCallback(
    (amountDel: number): string[] => {
      return selectCoinsForAmount(coins, amountDel);
    },
    [coins],
  );

  return {
    coins,
    primaryCoin,
    totalBalance: totalBalance.toString(),
    totalBalanceFormatted: formatDelBalance(totalBalance),
    isLoading,
    error: error?.message || null,
    refetch,
    hasDel: coins.length > 0,
    selectCoinsForBet,
  };
}

// DEL 잔액 포맷팅 (소수점 처리)
function formatDelBalance(balance: bigint): string {
  // DEL이 9 decimals라고 가정 (Sui 표준)
  const decimals = 9;
  const divisor = BigInt(10 ** decimals);
  const wholePart = balance / divisor;
  const fractionalPart = balance % divisor;

  if (fractionalPart === BigInt(0)) {
    return wholePart.toLocaleString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 2);
  return `${wholePart.toLocaleString()}.${fractionalStr}`;
}
