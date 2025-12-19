/**
 * Crystal Purchase API
 *
 * SUI를 지불하고 Crystal을 구매하는 API
 * - 0.1 SUI = 10 Crystal
 * - 0.5 SUI = 50 Crystal
 *
 * 사용자가 SUI를 Admin 주소로 전송하면 DB에 Crystal 추가
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { users, pointTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from '@/lib/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toBase64 } from '@mysten/sui/utils';

export const runtime = 'nodejs';

// SUI decimals: 1 SUI = 10^9 MIST
const SUI_DECIMALS = 9;

// Crystal packages
const CRYSTAL_PACKAGES: Record<string, { sui: number; crystal: number }> = {
  crystal_pack_10: { sui: 0.1, crystal: 10 },
  crystal_pack_50: { sui: 0.5, crystal: 50 },
};

// Admin 주소 및 키페어
function getAdminKeypair(): Ed25519Keypair {
  const adminKey = process.env.SUI_ADMIN_SECRET_KEY;
  if (!adminKey) {
    throw new Error('SUI_ADMIN_SECRET_KEY not configured');
  }
  const { secretKey } = decodeSuiPrivateKey(adminKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function getAdminAddress(): string {
  return getAdminKeypair().toSuiAddress();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userAddress, packageId, txBytes, userSignature } = body;

    if (action === 'prepare') {
      return handlePrepare(userAddress, packageId);
    } else if (action === 'execute') {
      return handleExecute(userAddress, packageId, txBytes, userSignature);
    } else {
      return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Crystal API] Error:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
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

  // SUI coin split and transfer to admin
  const [coin] = tx.splitCoins(tx.gas, [suiAmount]);
  tx.transferObjects([coin], adminAddress);

  // 트랜잭션 빌드
  const builtTx = await tx.build({ client: suiClient });
  const txBytesBase64 = toBase64(builtTx);

  return NextResponse.json({
    success: true,
    data: {
      txBytes: txBytesBase64,
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
) {
  if (!userAddress || !txBytes || !userSignature) {
    return NextResponse.json(
      { success: false, message: 'Missing required fields' },
      { status: 400 },
    );
  }

  const crystalPack = CRYSTAL_PACKAGES[packageId];
  if (!crystalPack) {
    return NextResponse.json({ success: false, message: 'Invalid package ID' }, { status: 400 });
  }

  console.log(`[Crystal] Executing: ${packageId} for ${userAddress}`);

  try {
    // 트랜잭션 실행 (사용자 서명만으로 실행)
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: userSignature,
      options: {
        showEffects: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error('Transaction failed: ' + JSON.stringify(result.effects?.status));
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

    let odataUserId: string;
    let currentCrystal: number;

    if (existingUser[0]) {
      odataUserId = existingUser[0].id;
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
      odataUserId = newUser[0].id;
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
      .where(eq(users.id, odataUserId));

    // 거래 기록
    await db.insert(pointTransactions).values({
      userId: odataUserId,
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
  } catch (error) {
    console.error('[Crystal] Execution error:', error);
    throw error;
  }
}
