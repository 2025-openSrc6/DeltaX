import { getDb } from '@/lib/db';
import { users, pointTransactions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { User, NewUser } from '@/db/schema/users';

export class UserRepository {
  async findBySuiAddress(suiAddress: string): Promise<User | null> {
    const db = getDb();
    const result = await db.select().from(users).where(eq(users.suiAddress, suiAddress)).limit(1);
    return result[0] || null;
  }

  async create(input: { suiAddress: string }): Promise<User> {
    const db = getDb();
    const newUser: NewUser = {
      suiAddress: input.suiAddress,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const result = await db.insert(users).values(newUser).returning();
    return result[0];
  }

  async findById(id: string): Promise<User | null> {
    const db = getDb();
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] || null;
  }

  /**
   * 해당 라운드에 로그인 보상을 이미 받았는지 확인
   */
  async hasRoundLoginBonus(userId: string, roundId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .select()
      .from(pointTransactions)
      .where(
        and(
          eq(pointTransactions.userId, userId),
          eq(pointTransactions.type, 'ROUND_LOGIN_BONUS'),
          eq(pointTransactions.referenceType, 'ROUND'),
          eq(pointTransactions.referenceId, roundId),
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  /**
   * 라운드 첫 로그인 보상 지급
   * Cloudflare D1에서는 db.transaction()을 지원하지 않으므로 db.batch()로 처리
   * 중복 지급 방지를 위해 사전 체크
   * @param suiTxHash Sui 온체인 트랜잭션 해시 (선택적, 있으면 기록)
   */
  async grantRoundLoginBonus(
    userId: string,
    roundId: string,
    amount: number,
    suiTxHash?: string,
  ): Promise<void> {
    const db = getDb();

    // 0. 중복 지급 방지: 먼저 체크
    const existingBonus = await db
      .select()
      .from(pointTransactions)
      .where(
        and(
          eq(pointTransactions.userId, userId),
          eq(pointTransactions.type, 'ROUND_LOGIN_BONUS'),
          eq(pointTransactions.referenceType, 'ROUND'),
          eq(pointTransactions.referenceId, roundId),
        ),
      )
      .limit(1);

    if (existingBonus.length > 0) {
      // 이미 보상을 받았으면 조용히 반환 (중복 지급 방지)
      return;
    }

    // 1. 현재 잔액 조회
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw new Error('User not found');
    }

    const balanceBefore = user.delBalance;
    const balanceAfter = balanceBefore + amount;
    const now = Date.now();

    // 2. batch로 포인트 트랜잭션 기록 + 유저 잔액 업데이트
    await db.batch([
      db.insert(pointTransactions).values({
        userId,
        type: 'ROUND_LOGIN_BONUS',
        currency: 'DEL',
        amount,
        balanceBefore,
        balanceAfter,
        referenceId: roundId,
        referenceType: 'ROUND',
        description: `라운드 첫 로그인 보상: ${amount} DEL${suiTxHash ? ` (온체인: ${suiTxHash})` : ''}`,
        suiTxHash: suiTxHash || null,
        createdAt: now,
      }),
      db
        .update(users)
        .set({
          delBalance: balanceAfter,
          updatedAt: now,
        })
        .where(eq(users.id, userId)),
    ]);
  }

  /**
   * 최근 활성 사용자 조회 (updatedAt 기준)
   * @param minutesAgo N분 이내에 활동한 사용자 조회
   */
  async findRecentActiveUsers(minutesAgo: number = 30): Promise<User[]> {
    const db = getDb();
    const cutoffTime = Date.now() - minutesAgo * 60 * 1000;
    const result = await db
      .select()
      .from(users)
      .where(sql`${users.updatedAt} >= ${cutoffTime}`)
      .orderBy(sql`${users.updatedAt} DESC`);
    return result;
  }

  /**
   * 유저 활동 시간 업데이트 (updatedAt 갱신)
   */
  async updateActivityTime(userId: string): Promise<void> {
    const db = getDb();
    await db
      .update(users)
      .set({
        updatedAt: Date.now(),
      })
      .where(eq(users.id, userId));
  }

  /**
   * 유저 잔액 업데이트 (동기화용)
   */
  async updateBalance(userId: string, newBalance: number): Promise<void> {
    const db = getDb();
    await db
      .update(users)
      .set({
        delBalance: newBalance,
        updatedAt: Date.now(),
      })
      .where(eq(users.id, userId));
  }
}
