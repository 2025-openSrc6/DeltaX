/**
 * Crystal Purchase API
 * 
 * SUI를 지불하고 Crystal을 구매하는 API
 * - 0.1 SUI = 10 Crystal
 * - 0.5 SUI = 50 Crystal
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { users, pointTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Transaction } from '@mysten/sui/transactions';
import { SuiService } from '@/lib/sui/service';
import { suiClient } from '@/lib/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export const runtime = 'nodejs';

const suiService = new SuiService();

// SUI decimals: 1 SUI = 10^9 MIST
const SUI_DECIMALS = 9;

// Crystal packages
const CRYSTAL_PACKAGES: Record<string, { sui: number; crystal: number }> = {
    'crystal_pack_10': { sui: 0.1, crystal: 10 },
    'crystal_pack_50': { sui: 0.5, crystal: 50 },
};

// Admin 주소 계산
function getAdminAddress(): string {
    const adminKey = process.env.SUI_ADMIN_SECRET_KEY;
    if (!adminKey) {
        throw new Error('SUI_ADMIN_SECRET_KEY not configured');
    }
    const { secretKey } = decodeSuiPrivateKey(adminKey);
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);
    return keypair.toSuiAddress();
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, userAddress, packageId, txBytes, userSignature, nonce } = body;

        if (action === 'prepare') {
            return handlePrepare(userAddress, packageId);
        } else if (action === 'execute') {
            return handleExecute(userAddress, packageId, txBytes, userSignature, nonce);
        } else {
            return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        console.error('[Crystal API] Error:', error);
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

/**
 * Prepare: SUI 전송 트랜잭션 빌드
 */
async function handlePrepare(userAddress: string, packageId: string) {
    if (!userAddress) {
        return NextResponse.json({ success: false, message: 'userAddress required' }, { status: 400 });
    }

    const crystalPack = CRYSTAL_PACKAGES[packageId];
    if (!crystalPack) {
        return NextResponse.json({ success: false, message: 'Invalid package ID' }, { status: 400 });
    }

    const adminAddress = getAdminAddress();
    const suiAmount = BigInt(Math.floor(crystalPack.sui * 10 ** SUI_DECIMALS));

    console.log(`[Crystal] Preparing: ${crystalPack.sui} SUI -> ${crystalPack.crystal} Crystal`);
    console.log(`[Crystal] Admin address: ${adminAddress}`);
    console.log(`[Crystal] SUI amount (MIST): ${suiAmount}`);

    // SUI 전송 트랜잭션 빌드
    const tx = new Transaction();
    tx.setSender(userAddress);

    // SUI coin split and transfer
    const [coin] = tx.splitCoins(tx.gas, [suiAmount]);
    tx.transferObjects([coin], adminAddress);

    // Build and prepare
    const { txBytes, nonce, expiresAt } = await suiService.prepareTransaction(tx, userAddress);

    return NextResponse.json({
        success: true,
        data: {
            txBytes,
            nonce,
            expiresAt,
            crystalAmount: crystalPack.crystal,
            suiAmount: crystalPack.sui,
            adminAddress,
        },
    });
}

/**
 * Execute: 트랜잭션 실행 + DB crystal 업데이트
 */
async function handleExecute(
    userAddress: string,
    packageId: string,
    txBytes: string,
    userSignature: string,
    nonce: string
) {
    if (!userAddress || !txBytes || !userSignature || !nonce) {
        return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const crystalPack = CRYSTAL_PACKAGES[packageId];
    if (!crystalPack) {
        return NextResponse.json({ success: false, message: 'Invalid package ID' }, { status: 400 });
    }

    console.log(`[Crystal] Executing: ${packageId} for ${userAddress}`);

    // 트랜잭션 실행 (Sponsor 방식)
    const result = await suiService.executeWithSponsor(txBytes, userSignature, nonce);

    if (!result.digest) {
        throw new Error('Transaction execution failed');
    }

    console.log(`[Crystal] TX Success: ${result.digest}`);

    // DB 업데이트
    const db = getDb();

    // 유저 조회 또는 생성
    const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.suiAddress, userAddress))
        .limit(1);

    let userId: string;
    let currentCrystal: number;

    if (existingUser[0]) {
        userId = existingUser[0].id;
        currentCrystal = existingUser[0].crystalBalance;
    } else {
        // 유저 생성
        const newUser = await db
            .insert(users)
            .values({
                suiAddress: userAddress,
                crystalBalance: 0,
            })
            .returning();
        userId = newUser[0].id;
        currentCrystal = 0;
    }

    // Crystal 잔액 업데이트
    const newCrystal = currentCrystal + crystalPack.crystal;
    await db
        .update(users)
        .set({
            crystalBalance: newCrystal,
            updatedAt: Date.now(),
        })
        .where(eq(users.id, userId));

    // 거래 기록
    await db.insert(pointTransactions).values({
        userId,
        type: 'CRYSTAL_PURCHASE',
        currency: 'CRYSTAL',
        amount: crystalPack.crystal,
        balanceBefore: currentCrystal,
        balanceAfter: newCrystal,
        referenceId: packageId,
        referenceType: 'CRYSTAL_PACK',
        description: `${crystalPack.sui} SUI로 ${crystalPack.crystal} Crystal 구매 (TX: ${result.digest.slice(0, 10)}...)`,
    });

    console.log(`[Crystal] DB Updated: ${currentCrystal} -> ${newCrystal} Crystal`);

    return NextResponse.json({
        success: true,
        data: {
            digest: result.digest,
            crystalAmount: crystalPack.crystal,
            newBalance: newCrystal,
        },
    });
}
