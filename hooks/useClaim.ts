'use client';

import { useState } from 'react';
import { useSignTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

interface ClaimParams {
    betId: string;
}

interface ClaimResult {
    success: boolean;
    digest?: string;
    payoutAmount?: number;
    error?: string;
}

export function useClaim() {
    const account = useCurrentAccount();
    const { mutateAsync: signTransaction } = useSignTransaction();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const claim = async (params: ClaimParams): Promise<ClaimResult> => {
        if (!account) {
            return { success: false, error: '지갑을 먼저 연결해주세요' };
        }

        setLoading(true);
        setError(null);

        try {
            // 1. Prepare: 서버에서 txBytes 받기
            const prepareRes = await fetch('/api/bets/claim/prepare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    betId: params.betId,
                }),
            });

            const prepareData = await prepareRes.json();

            if (!prepareData.success) {
                throw new Error(prepareData.error?.message || '클레임 준비 실패');
            }

            const { txBytes, nonce } = prepareData.data;

            // 2. Sign: 지갑에서 서명
            const txBytesArray = Uint8Array.from(atob(txBytes), (c) => c.charCodeAt(0));
            const transaction = Transaction.from(txBytesArray);

            const signedResult = await signTransaction({
                transaction,
            });

            // 3. Execute: 서버에 서명 전달하여 체인 실행
            const executeRes = await fetch('/api/bets/claim/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    betId: params.betId,
                    txBytes,
                    userSignature: signedResult.signature,
                    nonce,
                }),
            });

            const executeData = await executeRes.json();

            if (!executeData.success) {
                throw new Error(executeData.error?.message || '클레임 실행 실패');
            }

            return {
                success: true,
                digest: executeData.data.digest,
                payoutAmount: executeData.data.payoutAmount,
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
        claim,
        loading,
        error,
        isConnected: !!account,
    };
}
