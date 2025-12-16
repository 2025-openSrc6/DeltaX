/**
 * Shop Purchase Prepare API
 * 
 * DEL 토큰으로 상점 아이템 구매를 위한 트랜잭션을 준비합니다.
 */

import { getDb } from '@/lib/db';
import { shopItems, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { SuiService } from '@/lib/sui/service';
import { getDelBalance, selectDelCoin } from '@/lib/sui/balance';

export const runtime = 'nodejs';

const suiService = new SuiService();

// DEL decimals: 1 DEL = 10^9 units
const DEL_DECIMALS = 9;

export async function POST(request: Request) {
    console.log('🛒 POST /api/shop/purchase/prepare called');

    try {
        const body = await request.json();
        console.log('📦 Request body:', body);

        const { userAddress, itemId, userDelCoinId } = body;

        if (!userAddress || !itemId) {
            return Response.json(
                { success: false, error: 'MISSING_PARAMS', message: 'userAddress and itemId are required' },
                { status: 400 }
            );
        }

        const db = getDb();

        // 1. 아이템 정보 조회
        const item = await db
            .select()
            .from(shopItems)
            .where(eq(shopItems.id, itemId))
            .limit(1);

        if (!item[0]) {
            return Response.json(
                { success: false, error: 'ITEM_NOT_FOUND', message: '아이템을 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        if (!item[0].available) {
            return Response.json(
                { success: false, error: 'ITEM_UNAVAILABLE', message: '판매 중지된 아이템입니다' },
                { status: 400 }
            );
        }

        // 2. DEL 토큰만 지원 (CRYSTAL은 기존 방식 유지)
        if (item[0].currency !== 'DEL') {
            return Response.json(
                { success: false, error: 'INVALID_CURRENCY', message: '이 API는 DEL 토큰 구매만 지원합니다. CRYSTAL 구매는 /api/nfts/purchase를 사용하세요.' },
                { status: 400 }
            );
        }

        // 3. 온체인 DEL 잔액 확인
        const requiredAmount = BigInt(item[0].price) * BigInt(10 ** DEL_DECIMALS);
        const onChainBalance = await getDelBalance(userAddress);

        console.log(`💰 On-chain DEL balance: ${onChainBalance}, Required: ${requiredAmount}`);

        if (onChainBalance < requiredAmount) {
            return Response.json(
                {
                    success: false,
                    error: 'INSUFFICIENT_BALANCE',
                    message: 'DEL 잔액이 부족합니다',
                    data: {
                        required: item[0].price,
                        balance: Number(onChainBalance / BigInt(10 ** DEL_DECIMALS)),
                    }
                },
                { status: 400 }
            );
        }

        // 4. DEL Coin 선택 (프론트에서 전달하거나 자동 선택)
        let selectedCoinId = userDelCoinId;
        if (!selectedCoinId) {
            const coin = await selectDelCoin(userAddress, requiredAmount);
            if (!coin) {
                return Response.json(
                    { success: false, error: 'NO_SUITABLE_COIN', message: '적합한 DEL 코인을 찾을 수 없습니다' },
                    { status: 400 }
                );
            }
            selectedCoinId = coin.objectId;
        }

        console.log(`🪙 Selected DEL coin: ${selectedCoinId}`);

        // 5. 트랜잭션 준비
        const prepared = await suiService.prepareShopPurchase({
            userAddress,
            userDelCoinId: selectedCoinId,
            itemId,
            amount: requiredAmount,
        });

        console.log(`✅ Transaction prepared, nonce: ${prepared.nonce}`);

        return Response.json({
            success: true,
            data: {
                txBytes: prepared.txBytes,
                nonce: prepared.nonce,
                expiresAt: prepared.expiresAt,
                item: {
                    id: item[0].id,
                    name: item[0].name,
                    price: item[0].price,
                    currency: item[0].currency,
                },
                selectedCoinId,
            },
        });

    } catch (error) {
        console.error('❌ Prepare failed:', error);
        return Response.json(
            {
                success: false,
                error: 'PREPARE_FAILED',
                message: error instanceof Error ? error.message : '구매 준비에 실패했습니다'
            },
            { status: 500 }
        );
    }
}
