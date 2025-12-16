/**
 * Shop Purchase Execute API
 * 
 * 유저 서명을 받아 상점 구매 트랜잭션을 실행하고 DB를 업데이트합니다.
 */

import { getDb } from '@/lib/db';
import { shopItems, users, achievements, pointTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { SuiService } from '@/lib/sui/service';
import { mintNFT } from '@/lib/sui/nft';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

export const runtime = 'nodejs';

const suiService = new SuiService();

// DEL decimals: 1 DEL = 10^9 units
const DEL_DECIMALS = 9;

export async function POST(request: Request) {
    console.log('🛒 POST /api/shop/purchase/execute called');

    try {
        const body = await request.json();
        console.log('📦 Request body:', body);

        const { txBytes, userSignature, nonce, itemId, userAddress } = body;

        if (!txBytes || !userSignature || !nonce || !itemId || !userAddress) {
            return Response.json(
                { success: false, error: 'MISSING_PARAMS', message: 'All parameters are required' },
                { status: 400 }
            );
        }

        // 1. 체인에서 트랜잭션 실행
        console.log('⛓️ Executing on-chain transaction...');
        const result = await suiService.executeShopPurchase({
            txBytes,
            userSignature,
            nonce,
            itemId,
            userAddress,
        });

        console.log(`✅ Transaction executed, digest: ${result.digest}`);

        // 2. DB 업데이트 (체인 성공 후)
        const db = getDb();

        // 아이템 조회
        const item = await db
            .select()
            .from(shopItems)
            .where(eq(shopItems.id, itemId))
            .limit(1);

        if (!item[0]) {
            // 이미 체인에서 실행됨 - 하지만 아이템을 못 찾음 (비정상)
            console.error('⚠️ Item not found after chain execution');
            return Response.json({
                success: true,
                warning: 'ITEM_NOT_FOUND_AFTER_EXECUTION',
                data: { digest: result.digest },
            });
        }

        // 유저 조회 (생성 or 조회)
        const existingUser = await db
            .select()
            .from(users)
            .where(eq(users.suiAddress, userAddress))
            .limit(1);

        const user = existinguser ?? (await (async () => {
            // 유저 자동 생성
            const newUser = await db.insert(users).values({
                suiAddress: userAddress,
                nickname: null,
                delBalance: 0, // 이제 온체인에서 관리
                crystalBalance: 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }).returning();
            console.log('✅ New user created:', userAddress);
            return newuser;
        })());

        // 3. 아이템별 효과 적용
        let nftObjectId: string | undefined;
        let ipfsMetadataUrl: string | undefined;
        const updates: Partial<typeof users.$inferSelect> = {};

        // 닉네임 변경권
        if (item[0].category === 'NICKNAME') {
            const { newNickname } = body;
            if (newNickname && typeof newNickname === 'string' && newNickname.length >= 2) {
                updates.nickname = newNickname;
            }
        }

        // 닉네임 컬러
        if (item[0].category === 'COLOR') {
            let metadata: Record<string, unknown> = {};
            try {
                metadata = item[0].metadata ? JSON.parse(item[0].metadata) : {};
            } catch { /* ignore */ }
            updates.nicknameColor = (metadata.color as string) || 'RAINBOW';
        }

        // 부스트 아이템
        if (item[0].category === 'BOOST') {
            let metadata: Record<string, unknown> = {};
            try {
                metadata = item[0].metadata ? JSON.parse(item[0].metadata) : {};
            } catch { /* ignore */ }
            const duration = (metadata.durationMs as number) || 24 * 60 * 60 * 1000;
            const currentBoost = user.boostUntil || Date.now();
            updates.boostUntil = Math.max(currentBoost, Date.now()) + duration;
        }

        // 일반 아이템 (Green Mushroom)
        if (item[0].category === 'ITEM' && item[0].id.includes('mushroom')) {
            updates.greenMushrooms = (user.greenMushrooms || 0) + 1;
        }

        // NFT 아이템
        if (item[0].category === 'NFT') {
            console.log('🎨 NFT 민팅 시작...');
            console.log('📦 DB Item Data:', JSON.stringify(item[0], null, 2));
            try {
                const isMockMinting = process.env.MOCK_MINTING === 'true';
                console.log(`  - MOCK_MINTING: ${isMockMinting}`);
                console.log(`  - Raw imageUrl from DB: "${item[0].imageUrl}"`);

                // NFT ID -> IPFS CID 매핑 (Pinata에 업로드된 실제 CID)
                const IPFS_MAPPING: Record<string, string> = {
                    'nft_obsidian': 'ipfs://bafybeihhwd3ivt5k6s6qnj3yscm3wtretf2bzdmostflwicfar4t6vmcjy',
                    'nft_obsidian_crane': 'ipfs://bafybeihowygs5i6n7tdazn2wrhhwz2nrwobgtjsn57y6gkj7ypezjguh7i',
                    'nft_obsidian_otter': 'ipfs://bafybeigijtniqm2azxpdhs2pywytnw6tlvjcqz6xyqtz74tputmxnz2qoa',
                    'nft_obsidian_ssang': 'ipfs://bafybeifxzkgrd2klnv5y65qza6gswcejzrg24kued3k6is2sgofbtligxy',
                    'nft_obsidian_bear': 'ipfs://bafybeiglrknmrxo3jm4g3nveqvxv6n4sozp3y32ib7cxik3ammjsmpryf4',
                    'nft_aurum': 'ipfs://bafybeihfdmhzmkqzomzq3s2jvy2o7pjtshnhx63wwd5y66j7hrh2ftsysi',
                    'nft_aurum_white_tiger': 'ipfs://bafybeic7y5qkv34fclloygbntzf63tbdzvhlarrdnt7sn6opvucmlc3pze',
                    'nft_aurum_black_turtle': 'ipfs://bafybeicddiccbudqjtblgkfs4fgm7so3vciljx26rmaioc3nr5dlvwwkwu',
                    'nft_aurum_fire_bird': 'ipfs://bafybeieruflmccrv44haggwfjpryfytcupcspmxzogwc2vlod3daun6zou',
                    'nft_nova': 'ipfs://bafybeibsxr6ztbo6fushzmmqpwptddxtam5oimvnamuntqfhzoajsqi3aa',
                    'nft_nova_ground': 'ipfs://bafybeifo2iw4nyynamdohbl45vtb4pkc3puqyhwxdds63jt3s7hhbigpj4',
                    'nft_nova_man': 'ipfs://bafybeidx2vv3fiepz4z5m7nwabpcucq5hvhotshwrmgvfssln7dfllolfi',
                    'nft_aetherion': 'ipfs://bafybeidkisur3ziwdnicakyhcuaxejlbnyonb4t4xnhmobjl7inkny24ea',
                    'nft_aetherion_mugeuk': 'ipfs://bafybeigyo56qmbtrzj4vprk4rh5x5ausiyemjgsxjvfvocbsfam6bwqv6u',
                    'nft_singularity': 'ipfs://bafybeih6qzbs2dfazjxvh35ndc6aoatbpb2ilxryhpm2gl27lslx6uypry',
                };

                // 매핑에서 IPFS URL 가져오기, 없으면 DB 값 사용
                const imageUrl = IPFS_MAPPING[item[0].id] ||
                    (item[0].imageUrl?.startsWith('ipfs://') ? item[0].imageUrl : `ipfs://QmPlaceholder${item[0].tier}`);

                console.log(`  - Final Image URL: ${imageUrl}`);
                console.log(`  - Tier: ${item[0].tier}`);
                console.log(`  - User: ${user.suiAddress}`);

                ipfsMetadataUrl = imageUrl;

                if (isMockMinting) {
                    console.log('🧪 Mock Minting Enabled');
                    nftObjectId = `mock_nft_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                } else {
                    console.log('  - 실제 민팅 진행...');

                    const adminKey = process.env.SUI_ADMIN_SECRET_KEY;
                    if (!adminKey) {
                        throw new Error('SUI_ADMIN_SECRET_KEY 환경변수가 설정되지 않았습니다');
                    }
                    console.log(`  - Admin key loaded: ${adminKey.slice(0, 15)}...`);

                    // Bech32 형식 (suiprivkey1...) 키 파싱
                    const { secretKey } = decodeSuiPrivateKey(adminKey);
                    const adminKeypair = Ed25519Keypair.fromSecretKey(secretKey);
                    console.log(`  - Admin address: ${adminKeypair.toSuiAddress()}`);

                    const { nftObjectId: mintedNftId, txHash } = await mintNFT({
                        userAddress: user.suiAddress,
                        metadataUrl: imageUrl,
                        tier: item[0].tier!,
                        name: item[0].name,
                        description: item[0].description || `${item[0].tier} Tier NFT`,
                        adminKeypair,
                    });

                    console.log(`✅ NFT 민팅 성공! Object ID: ${mintedNftId}, TX: ${txHash}`);
                    nftObjectId = mintedNftId;
                }
            } catch (error) {
                console.error('❌ NFT Minting Error:', error);
                console.error('  - Error message:', error instanceof Error ? error.message : String(error));
                // NFT 민팅 실패해도 구매는 이미 체인에서 완료됨
            }
        }

        // 유저 업데이트 (효과가 있는 경우만)
        if (Object.keys(updates).length > 0) {
            updates.updatedAt = Date.now();
            await db
                .update(users)
                .set(updates)
                .where(eq(users.id, user.id));
        }

        // 포인트 거래 기록 (참고용 - 실제 잔액은 온체인)
        await db.insert(pointTransactions).values({
            userId: user.id,
            type: 'SHOP_PURCHASE',
            currency: item[0].currency,
            amount: -item[0].price,
            balanceBefore: 0, // 온체인 잔액은 별도 조회 필요
            balanceAfter: 0,
            referenceId: item[0].id,
            referenceType: 'SHOP_ITEM',
            description: `${item[0].name} 구매 (TX: ${result.digest})`,
        });

        // 아이템 지급 기록
        await db.insert(achievements).values({
            userId: user.id,
            type: item[0].category,
            tier: item[0].tier,
            name: item[0].name,
            purchasePrice: item[0].price,
            currency: item[0].currency,
            suiNftObjectId: nftObjectId,
            ipfsMetadataUrl,
            properties: JSON.stringify({ suiTxHash: result.digest }),
            acquiredAt: Date.now(),
        });

        console.log(`✅ Purchase complete: ${item[0].name} for ${item[0].price} DEL`);

        return Response.json({
            success: true,
            data: {
                digest: result.digest,
                item: {
                    id: item[0].id,
                    name: item[0].name,
                    category: item[0].category,
                },
                nftObjectId,
                ipfsMetadataUrl,
            },
        });

    } catch (error) {
        console.error('❌ Execute failed:', error);

        // 특정 에러 처리
        const message = error instanceof Error ? error.message : '구매 실행에 실패했습니다';
        const errorCode = message.includes('NONCE') ? 'NONCE_ERROR'
            : message.includes('MISMATCH') ? 'VALIDATION_ERROR'
                : 'EXECUTE_FAILED';

        return Response.json(
            { success: false, error: errorCode, message },
            { status: 500 }
        );
    }
}
