/**
 * Admin API - Crystal 추가
 * 개발용 API입니다.
 */

import { getDb } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { suiAddress, amount } = body;

    if (!suiAddress || !amount) {
      return Response.json(
        { success: false, error: 'suiAddress and amount are required' },
        { status: 400 },
      );
    }

    const db = getDb();

    // 유저 조회
    const user = await db.select().from(users).where(eq(users.suiAddress, suiAddress)).limit(1);

    if (!user[0]) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Crystal 추가
    const newBalance = (user[0].crystalBalance || 0) + amount;
    await db
      .update(users)
      .set({
        crystalBalance: newBalance,
        updatedAt: Date.now(),
      })
      .where(eq(users.id, user[0].id));

    return Response.json({
      success: true,
      data: {
        userId: user[0].id,
        previousBalance: user[0].crystalBalance || 0,
        addedAmount: amount,
        newBalance,
      },
    });
  } catch (error) {
    console.error('Admin add-crystal error:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
