/**
 * BetRepository - 베팅 데이터 접근 레이어
 *
 * 책임:
 * - DB 쿼리 생성 (Drizzle ORM)
 * - 트랜잭션 처리 (D1 Batch 사용)
 * - Atomic 업데이트
 * - 실패 시 보상 트랜잭션 (Compensation) 처리
 *
 * D1 Batch 전략:
 * - Interactive Transaction 미지원으로 인해 batch API 사용
 * - 조건 불만족 시 보상 트랜잭션으로 데이터 정합성 보장
 */

import { getDb } from '@/lib/db';
import { bets, rounds, users } from '@/db/schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Bet } from '@/db/schema/bets';
import type { Round } from '@/db/schema/rounds';
import type { BetQueryParams, CreatePendingBetInput, FinalizeBetExecutionInput } from './types';
import { NotFoundError } from '@/lib/shared/errors';

export class BetRepository {
  /**
   * 베팅 목록 조회 (필터/정렬/페이지네이션)
   */
  async findMany(params: BetQueryParams): Promise<Bet[]> {
    const db = getDb();
    const { filters, sort, order, limit, offset } = params;

    const whereConditions = this.buildFilters(filters);
    const orderColumn = sort === 'amount' ? bets.amount : bets.createdAt;
    const orderByExpression = order === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const baseQuery = db.select().from(bets);
    const queryWithConditions = whereConditions ? baseQuery.where(whereConditions) : baseQuery;

    return queryWithConditions.orderBy(orderByExpression).limit(limit).offset(offset);
  }

  /**
   * 베팅 개수 조회 (페이지네이션용)
   */
  async count(params: BetQueryParams): Promise<number> {
    const db = getDb();
    const whereConditions = this.buildFilters(params.filters);

    const baseQuery = db.select({ count: sql<number>`count(*)` }).from(bets);
    const queryWithConditions = whereConditions ? baseQuery.where(whereConditions) : baseQuery;

    const result = await queryWithConditions;
    return result[0]?.count ?? 0;
  }

  /**
   * ID로 베팅 조회
   */
  async findById(id: string): Promise<Bet | undefined> {
    const db = getDb();
    const result = await db.select().from(bets).where(eq(bets.id, id)).limit(1);
    return result[0];
  }

  /**
   * 베팅 생성 (Pending) - 풀/잔액은 확정 차감하지 않음
   */
  async createPending(input: CreatePendingBetInput): Promise<Bet> {
    const db = getDb();
    const { id, roundId, userId, prediction, amount, createdAt } = input;
    const now = Date.now();

    try {
      const result = await db
        .insert(bets)
        .values({
          id,
          roundId,
          userId,
          prediction,
          amount,
          currency: 'DEL',
          resultStatus: 'PENDING',
          settlementStatus: 'PENDING',
          chainStatus: 'PENDING',
          createdAt,
          processedAt: now,
        })
        .returning();

      return result[0];
    } catch (error: unknown) {
      this.handleError(error);
      throw error; // Should be unreachable due to handleError throwing
    }
  }

  /**
   * 체인 실행 성공 후 확정 반영 (라운드 풀 + 유저 잔액 + Bet 상태)
   */
  async finalizeExecution(input: FinalizeBetExecutionInput): Promise<Bet> {
    const db = getDb();
    const { betId, roundId, userId, prediction, amount, suiTxHash } = input;
    const now = Date.now();

    const batchResults = await db.batch([
      // [0] Update Round Pool
      db
        .update(rounds)
        .set({
          totalPool: sql`${rounds.totalPool} + ${amount}`,
          totalGoldBets:
            prediction === 'GOLD' ? sql`${rounds.totalGoldBets} + ${amount}` : rounds.totalGoldBets,
          totalBtcBets:
            prediction === 'BTC' ? sql`${rounds.totalBtcBets} + ${amount}` : rounds.totalBtcBets,
          totalBetsCount: sql`${rounds.totalBetsCount} + 1`,
          updatedAt: now,
        })
        .where(eq(rounds.id, roundId))
        .returning(),

      // [1] Update User Balance
      db
        .update(users)
        .set({
          delBalance: sql`${users.delBalance} - ${amount}`,
          totalBets: sql`${users.totalBets} + 1`,
          totalVolume: sql`${users.totalVolume} + ${amount}`,
          updatedAt: now,
        })
        .where(and(eq(users.id, userId), sql`${users.delBalance} >= ${amount}`)),

      // [2] Update Bet
      db
        .update(bets)
        .set({
          chainStatus: 'EXECUTED',
          suiTxHash,
          processedAt: now,
        })
        .where(eq(bets.id, betId))
        .returning(),
    ]);

    const roundResult = batchResults[0] as Round[];
    const userUpdateResult = batchResults[1] as { meta?: { changes?: number } };
    const betResult = batchResults[2] as Bet[];

    const errors: string[] = [];
    if (!roundResult[0]) {
      errors.push('Round update failed');
    }
    const userRowsAffected = userUpdateResult?.meta?.changes ?? 0;
    if (userRowsAffected === 0) {
      errors.push('Insufficient balance');
    }
    if (!betResult[0]) {
      errors.push('Bet update failed');
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    return betResult[0];
  }

  /**
   * 라운드의 모든 베팅 조회 (정산용)
   *
   * @param roundId - 라운드 UUID
   * @returns 베팅 배열 (생성일순 정렬)
   */
  async findByRoundId(roundId: string): Promise<Bet[]> {
    const db = getDb();
    const result = await db
      .select()
      .from(bets)
      .where(eq(bets.roundId, roundId))
      .orderBy(asc(bets.createdAt));

    return result;
  }

  /**
   * ID로 베팅 업데이트
   *
   * @param id - 베팅 UUID
   * @param updateData - 업데이터 데이터 (Partial<Bet>)
   * @returns 업데이트된 베팅
   */
  async updateById(id: string, updateData: Partial<Bet>): Promise<Bet> {
    const db = getDb();
    const result = await db.update(bets).set(updateData).where(eq(bets.id, id)).returning();
    if (!result || result.length === 0) {
      throw new NotFoundError('Bet', id);
    }
    return result[0];
  }

  private handleError(error: unknown) {
    if (error instanceof Error && error.message?.includes('UNIQUE constraint failed')) {
      const e = new Error('Duplicate bet');
      Object.assign(e, { code: 'ALREADY_EXISTS' });
      throw e;
    }
    throw error;
  }

  private buildFilters(filters?: BetQueryParams['filters']): SQL | undefined {
    if (!filters) return undefined;

    const conditions: SQL[] = [];

    if (filters.roundId) conditions.push(eq(bets.roundId, filters.roundId));
    if (filters.userId) conditions.push(eq(bets.userId, filters.userId));
    if (filters.prediction) conditions.push(eq(bets.prediction, filters.prediction));
    if (filters.resultStatus) conditions.push(eq(bets.resultStatus, filters.resultStatus));
    if (filters.settlementStatus)
      conditions.push(eq(bets.settlementStatus, filters.settlementStatus));

    return conditions.length > 0 ? and(...conditions) : undefined;
  }
}
