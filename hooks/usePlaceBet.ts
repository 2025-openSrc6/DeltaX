'use client';

import { useState } from 'react';
import { useSignTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

interface PlaceBetParams {
  roundId: string;
  prediction: 'GOLD' | 'BTC';
  amount: number;
  userDelCoinIds: string[]; // 베팅에 사용할 DEL 코인 ID 배열
}

interface PlaceBetResult {
  success: boolean;
  digest?: string;
  betObjectId?: string;
  error?: string;
}

export function usePlaceBet() {
  const account = useCurrentAccount();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeBet = async (params: PlaceBetParams): Promise<PlaceBetResult> => {
    if (!account) {
      return { success: false, error: '지갑을 먼저 연결해주세요' };
    }

    if (params.userDelCoinIds.length === 0) {
      return { success: false, error: 'DEL 토큰이 없습니다' };
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Prepare: 서버에서 txBytes 받기 (merge + split + place_bet PTB)
      const prepareRes = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          roundId: params.roundId,
          prediction: params.prediction,
          amount: params.amount,
          userAddress: account.address,
          userDelCoinIds: params.userDelCoinIds,
        }),
      });

      const prepareData = await prepareRes.json();

      if (!prepareData.success) {
        throw new Error(prepareData.error?.message || '베팅 준비 실패');
      }

      const { txBytes, nonce, betId } = prepareData.data;

      // 2. Sign: 지갑에서 서명
      const txBytesArray = Uint8Array.from(atob(txBytes), (c) => c.charCodeAt(0));
      const transaction = Transaction.from(txBytesArray);

      const signedResult = await signTransaction({
        transaction,
      });

      // 3. Execute: 서버에 서명 전달하여 체인 실행
      const executeRes = await fetch('/api/bets/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txBytes,
          userSignature: signedResult.signature,
          nonce,
          betId,
        }),
      });

      const executeData = await executeRes.json();

      if (!executeData.success) {
        throw new Error(executeData.error?.message || '베팅 실행 실패');
      }

      return {
        success: true,
        digest: executeData.data.digest,
        betObjectId: executeData.data.betObjectId,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  return {
    placeBet,
    loading,
    error,
    isConnected: !!account,
  };
}
