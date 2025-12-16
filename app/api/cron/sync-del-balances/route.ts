import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { getDb } from '@/lib/db';
import { users, pointTransactions } from '@/db/schema';
import { eq, gt, inArray } from 'drizzle-orm';

/**
 * POST /api/cron/sync-del-balances
 *
 * DEL 잔액 동기화 잡 (최적화 버전)
 * - 변경된 유저만 동기화하여 비용 절감
 * - 전략:
 *   1. 최근 활동한 유저만 동기화 (pointTransactions 기준)
 *   2. 마지막 동기화 이후 업데이트된 유저만
 *   3. 전체 동기화는 하루 1회만 실행
 *
 * Query Parameters:
 * - force: true면 전체 유저 동기화 (기본값: false)
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();
  const { searchParams } = request.nextUrl;
  const forceFullSync = searchParams.get('force') === 'true';

  cronLogger.info('[Job: Sync DEL Balances] Started', {
    jobStartTime,
    mode: forceFullSync ? 'full' : 'incremental',
  });

  try {
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job: Sync DEL Balances] Auth failed');
      return authResult.response;
    }
    cronLogger.info('[Job: Sync DEL Balances] Auth success');

    const db = getDb();
    const suiService = registry.suiService;

    // 동기화 대상 유저 조회
    const SYNC_WINDOW_MS = 5 * 60 * 1000; // 5분 이내 활동한 유저
    const BATCH_SIZE = 50;
    const MAX_CONCURRENT = 20; // 동시 처리 제한 (Sui RPC 부하 방지)
    let totalSynced = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    // 동기화 대상 유저 ID 목록 조회
    let targetUserIds: string[] = [];

    if (forceFullSync) {
      // 전체 동기화: 모든 유저 ID 조회
      const allUsers = await db.select({ id: users.id }).from(users);
      targetUserIds = allUsers.map((u) => u.id);
    } else {
      // 증분 동기화: 최근 활동한 유저만
      const recentActivityThreshold = Date.now() - SYNC_WINDOW_MS;

      // 최근 거래가 있는 유저 ID 조회 (DISTINCT)
      const recentTxUsers = await db
        .select({ userId: pointTransactions.userId })
        .from(pointTransactions)
        .where(gt(pointTransactions.createdAt, recentActivityThreshold));

      // 최근 업데이트된 유저 ID 조회
      const recentUpdatedUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(gt(users.updatedAt, recentActivityThreshold));

      // 중복 제거하여 합치기
      const userIdSet = new Set<string>();
      recentTxUsers.forEach((u) => userIdSet.add(u.userId));
      recentUpdatedUsers.forEach((u) => userIdSet.add(u.id));
      targetUserIds = Array.from(userIdSet);
    }

    cronLogger.info('[Job: Sync DEL Balances] Target users', {
      count: targetUserIds.length,
      mode: forceFullSync ? 'full' : 'incremental',
    });

    // 배치 단위로 처리
    let offset = 0;
    while (offset < targetUserIds.length) {
      const batchIds = targetUserIds.slice(offset, offset + BATCH_SIZE);

      // 배치 ID에 해당하는 유저 정보 조회
      const userBatch = await db
        .select({
          id: users.id,
          suiAddress: users.suiAddress,
          delBalance: users.delBalance,
        })
        .from(users)
        .where(inArray(users.id, batchIds));

      if (userBatch.length === 0) {
        break;
      }

      // 동시 처리 제한을 위해 청크로 나누어 처리
      const chunks: (typeof userBatch)[] = [];
      for (let i = 0; i < userBatch.length; i += MAX_CONCURRENT) {
        chunks.push(userBatch.slice(i, i + MAX_CONCURRENT));
      }

      for (const chunk of chunks) {
        // 각 유저의 온체인 DEL 잔액 조회 및 업데이트
        const syncResults = await Promise.allSettled(
          chunk.map(async (user) => {
            if (!user.suiAddress) {
              return { userId: user.id, success: false, error: 'Missing suiAddress' };
            }

            try {
              const onChainBalance = await suiService.getDelBalance(user.suiAddress);
              const dbBalance = user.delBalance;

              // 잔액이 다를 때만 업데이트
              if (onChainBalance !== dbBalance) {
                await db
                  .update(users)
                  .set({
                    delBalance: onChainBalance,
                    updatedAt: Date.now(),
                  })
                  .where(eq(users.id, user.id));

                totalUpdated++;
                cronLogger.info('[Job: Sync DEL Balances] Updated balance', {
                  userId: user.id,
                  suiAddress: user.suiAddress,
                  oldBalance: dbBalance,
                  newBalance: onChainBalance,
                  diff: onChainBalance - dbBalance,
                });

                return {
                  userId: user.id,
                  success: true,
                  updated: true,
                  oldBalance: dbBalance,
                  newBalance: onChainBalance,
                };
              }

              return { userId: user.id, success: true, updated: false };
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              cronLogger.error('[Job: Sync DEL Balances] Failed to sync user', {
                userId: user.id,
                suiAddress: user.suiAddress,
                error: message,
              });
              return { userId: user.id, success: false, error: message };
            }
          }),
        );

        // 결과 집계
        syncResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              totalSynced++;
            } else {
              totalErrors++;
            }
          } else {
            totalErrors++;
          }
        });
      }

      offset += BATCH_SIZE;
    }

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job: Sync DEL Balances] Completed', {
      mode: forceFullSync ? 'full' : 'incremental',
      totalSynced,
      totalUpdated,
      totalErrors,
      durationMs: jobDuration,
      avgTimePerUser: totalSynced > 0 ? jobDuration / totalSynced : 0,
    });

    return createSuccessResponse({
      success: true,
      mode: forceFullSync ? 'full' : 'incremental',
      totalSynced,
      totalUpdated,
      totalErrors,
      durationMs: jobDuration,
    });
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job: Sync DEL Balances] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
