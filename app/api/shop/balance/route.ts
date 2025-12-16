/**
 * DEL 잔액 조회 API
 * 
 * Sui 블록체인에서 유저의 DEL 토큰 잔액을 조회합니다.
 */

import { getDelBalance, getDelCoins, formatDelBalance } from '@/lib/sui/balance';

export const runtime = 'nodejs';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
        return Response.json(
            { success: false, error: 'MISSING_ADDRESS', message: 'address parameter is required' },
            { status: 400 }
        );
    }

    try {
        const [balance, coins] = await Promise.all([
            getDelBalance(address),
            getDelCoins(address),
        ]);

        return Response.json({
            success: true,
            data: {
                address,
                balance: balance.toString(),
                balanceFormatted: formatDelBalance(balance),
                // Display balance (DEL with 2 decimal places)
                balanceNumber: Number(balance) / 1e9,
                coins: coins.map(c => ({
                    objectId: c.objectId,
                    balance: c.balance.toString(),
                    balanceNumber: Number(c.balance) / 1e9,
                })),
            },
        });
    } catch (error) {
        console.error('Failed to get DEL balance:', error);
        return Response.json(
            { success: false, error: 'BALANCE_FETCH_FAILED', message: 'DEL 잔액 조회에 실패했습니다' },
            { status: 500 }
        );
    }
}
