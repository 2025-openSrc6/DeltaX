import { getDb } from '@/lib/db';
import { shopItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextContext } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: NextContext) {
    try {
        const db = getDb();

        let items = await db
            .select()
            .from(shopItems)
            .where(eq(shopItems.available, true));

        console.log(`🔍 DB Query Result: ${items.length} items found`);

        // DB에 아이템이 없으면 Mock Data 반환 (디버깅 및 비상용)
        if (items.length === 0) {
            console.warn('⚠️ No items found in DB, returning MOCK DATA');
            items = [
                {
                    id: 'mock_nickname',
                    category: 'NICKNAME',
                    name: '닉네임 변경권 (Mock)',
                    description: '닉네임을 설정할 수 있습니다.',
                    price: 50000,
                    currency: 'DEL',
                    requiresNickname: false,
                    imageUrl: 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=500&auto=format&fit=crop&q=60',
                    available: true,
                    tier: null,
                    metadata: null,
                    createdAt: Date.now()
                },
                {
                    id: 'mock_nft_obsidian',
                    category: 'NFT',
                    name: 'Obsidian Tier NFT (Mock)',
                    description: '테스트용 Mock NFT입니다.',
                    tier: 'Obsidian',
                    price: 300000,
                    currency: 'DEL',
                    imageUrl: '/images/tiger%20-%20obsidian.png',
                    available: true,
                    requiresNickname: false,
                    metadata: null,
                    createdAt: Date.now()
                }
            ];
        }

        // Tier 순서 정의
        const tierOrder: Record<string, number> = {
            'Obsidian': 1,
            'Aurum': 2,
            'Nova': 3,
            'Aetherion': 4,
            'Singularity': 5
        };

        // 카테고리별 그룹화 및 정렬
        const groupedItems: Record<string, typeof items> = {};

        // 초기화
        ['NICKNAME', 'COLOR', 'NFT', 'BOOST', 'ITEM'].forEach(cat => {
            groupedItems[cat] = [];
        });

        items.forEach(item => {
            if (!groupedItems[item.category]) {
                groupedItems[item.category] = [];
            }
            groupedItems[item.category].push(item);
        });

        // 각 그룹별 정렬
        Object.keys(groupedItems).forEach(category => {
            groupedItems[category].sort((a, b) => {
                // 1. NFT인 경우 Tier 순서로 정렬
                if (category === 'NFT') {
                    const tierA = tierOrder[a.tier || ''] || 99;
                    const tierB = tierOrder[b.tier || ''] || 99;
                    if (tierA !== tierB) return tierA - tierB;
                }

                // 2. 기본적으로 가격 오름차순 정렬
                return a.price - b.price;
            });
        });

        return Response.json({
            success: true,
            data: {
                items, // 기존 호환성 유지
                groupedItems, // 프론트엔드 편의를 위한 그룹화된 데이터
            },
        });
    } catch (error) {
        console.error('상점 아이템 조회 실패:', error);
        return Response.json(
            { error: 'INTERNAL_SERVER_ERROR', message: '상점 아이템을 불러오는데 실패했습니다.' },
            { status: 500 }
        );
    }
}
