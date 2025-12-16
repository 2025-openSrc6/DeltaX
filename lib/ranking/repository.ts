import { getDb } from '@/lib/db';
import { users, achievements } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import type { RawRankingRow } from './types';

/**
 * 랭킹 계산에 필요한 집계된 데이터를 DB에서 가져오는 함수
 * - users ↔ achievements LEFT JOIN
 * - DB 레벨에서 GROUP BY로 집계 및 정렬
 * - LIMIT을 직접 적용하여 필요한 데이터만 전송
 *
 * 주의:
 * - users.delBalance는 온체인 DEL 잔액을 주기적으로 동기화한 값입니다
 * - 크론 잡(/api/cron/sync-del-balances)에서 Sui 체인에서 조회한 값을 users.delBalance에 반영합니다
 * - totalAsset = 온체인 DEL 잔액 + NFT 구매 금액(achievements.purchasePrice 합계)
 */
export async function fetchRankingRows(limit: number): Promise<RawRankingRow[]> {
  const db = await getDb();

  const rows = await db
    .select({
      userId: users.id,
      walletAddress: users.suiAddress,
      delBalance: users.delBalance, // 온체인 동기화된 DEL 잔액
      achievementTotal: sql<number>`COALESCE(SUM(${achievements.purchasePrice}), 0)`.as(
        'achievement_total',
      ),
      totalAsset:
        sql<number>`${users.delBalance} + COALESCE(SUM(${achievements.purchasePrice}), 0)`.as(
          'total_asset',
        ),
    })
    .from(users)
    .leftJoin(achievements, eq(users.id, achievements.userId))
    .groupBy(users.id, users.suiAddress, users.delBalance)
    .orderBy(desc(sql`total_asset`))
    .limit(limit);

  return rows;
}
