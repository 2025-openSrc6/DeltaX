import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { getDb } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/cron/sync-del-balances
 *
 * DEL 잔액 동기화 잡
 * - Sui 체인에서 각 유저의 DEL 잔액을 조회
 * - users.delBalance를 온체인 값으로 업데이트
 * - 주기적으로 실행 (예: 5분마다)
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();
  cronLogger.info('[Job: Sync DEL Balances] Started', { jobStartTime });

  try {
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job: Sync DEL Balances] Auth failed');
      return authResult.response;
    }
    cronLogger.info('[Job: Sync DEL Balances] Auth success');

    const db = getDb();
    const suiService = registry.suiService;

    // 활성 유저 목록 조회 (페이지네이션)
    const BATCH_SIZE = 50;
    let offset = 0;
    let totalSynced = 0;
    let totalErrors = 0;

    while (true) {
      const userBatch = await db
        .select({
          id: users.id,
          suiAddress: users.suiAddress,
          delBalance: users.delBalance,
        })
        .from(users)
        .limit(BATCH_SIZE)
        .offset(offset);

      if (userBatch.length === 0) {
        break;
      }

      // 각 유저의 온체인 DEL 잔액 조회 및 업데이트
      const syncResults = await Promise.allSettled(
        userBatch.map(async (user) => {
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

              cronLogger.info('[Job: Sync DEL Balances] Updated balance', {
                userId: user.id,
                suiAddress: user.suiAddress,
                oldBalance: dbBalance,
                newBalance: onChainBalance,
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

      offset += BATCH_SIZE;

      // 다음 배치가 없으면 종료
      if (userBatch.length < BATCH_SIZE) {
        break;
      }
    }

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job: Sync DEL Balances] Completed', {
      totalSynced,
      totalErrors,
      durationMs: jobDuration,
    });

    return createSuccessResponse({
      success: true,
      totalSynced,
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
