import { UserRepository } from './repository';
import type { User } from '@/db/schema/users';
import { registry } from '@/lib/registry';
import { mintDel } from '@/lib/sui/admin';

export class UserService {
  constructor(private userRepository: UserRepository) {}

  async findOrCreateUser(suiAddress: string): Promise<User> {
    let user = await this.userRepository.findBySuiAddress(suiAddress);
    if (!user) {
      user = await this.userRepository.create({ suiAddress });
    }
    return user;
  }

  /**
   * 이번 라운드 첫 로그인 보상 체크 및 지급
   * 현재 활성 라운드(6HOUR)에서 사용자가 처음 로그인하는 경우 5000 DEL 지급
   * - Sui 체인에 실제로 mint하고, 성공 시 DB에 기록
   */
  async checkAndGrantRoundLoginBonus(
    userId: string,
  ): Promise<{ granted: boolean; roundId?: string; txDigest?: string }> {
    try {
      // 1. 현재 활성 라운드(6HOUR) 조회
      const currentRound = await registry.roundRepository.findCurrentRound('6HOUR');
      if (!currentRound) {
        // 활성 라운드가 없으면 보상 지급하지 않음
        return { granted: false };
      }

      // 2. 이미 보상을 받았는지 확인
      const hasBonus = await this.userRepository.hasRoundLoginBonus(userId, currentRound.id);
      if (hasBonus) {
        return { granted: false, roundId: currentRound.id };
      }

      // 3. 유저 정보 조회 (Sui 주소 필요)
      const user = await this.userRepository.findById(userId);
      if (!user || !user.suiAddress) {
        console.error('[UserService] User not found or missing suiAddress:', userId);
        return { granted: false };
      }

      // 4. Sui 체인에 DEL mint (5000 DEL)
      const bonusAmount = 5000;
      let txDigest: string | undefined;
      try {
        const mintResult = await mintDel(user.suiAddress, bonusAmount);
        txDigest = mintResult.txDigest;
      } catch (error) {
        // 온체인 mint 실패 시 에러 로깅하고 DB 업데이트하지 않음
        console.error('[UserService] Failed to mint DEL on-chain:', error);
        throw error; // 에러를 다시 던져서 catch 블록에서 처리
      }

      // 5. 온체인 mint 성공 시 DB에 기록
      await this.userRepository.grantRoundLoginBonus(
        userId,
        currentRound.id,
        bonusAmount,
        txDigest,
      );

      return { granted: true, roundId: currentRound.id, txDigest };
    } catch (error) {
      // 에러가 발생해도 로그인은 계속 진행되도록 에러를 로깅만 하고 반환
      console.error('[UserService] Failed to grant round login bonus:', error);
      return { granted: false };
    }
  }

  /**
   * 라운드 출석보상 지급 (라운드 오픈 시 활성 사용자들에게 자동 지급)
   * @param roundId 라운드 ID
   * @returns 지급된 사용자 수
   */
  async grantRoundAttendanceRewardsToActiveUsers(
    roundId: string,
  ): Promise<{ grantedCount: number; failedCount: number }> {
    const { cronLogger } = await import('@/lib/cron/logger');
    let grantedCount = 0;
    let failedCount = 0;

    try {
      // 1. 최근 30분 이내 활성 사용자 조회 (라운드 시작 전 대기 시간 고려)
      const activeUsers = await this.userRepository.findRecentActiveUsers(30);

      cronLogger.info('[RoundAttendanceReward] Checking active users', {
        roundId,
        minutesAgo: 30,
        foundCount: activeUsers.length,
        userIds: activeUsers.map((u) => u.id),
        suiAddresses: activeUsers.map((u) => u.suiAddress),
      });

      if (activeUsers.length === 0) {
        cronLogger.info('[RoundAttendanceReward] No active users found');
        return { grantedCount: 0, failedCount: 0 };
      }

      cronLogger.info('[RoundAttendanceReward] Found active users', {
        count: activeUsers.length,
        roundId,
      });

      const bonusAmount = 5000;

      // 2. 각 활성 사용자에게 보상 지급
      for (const user of activeUsers) {
        try {
          cronLogger.info('[RoundAttendanceReward] Processing user', {
            userId: user.id,
            suiAddress: user.suiAddress,
            updatedAt: new Date(user.updatedAt).toISOString(),
            roundId,
          });

          // 2-1. 이미 보상을 받았는지 확인
          const hasBonus = await this.userRepository.hasRoundLoginBonus(user.id, roundId);
          if (hasBonus) {
            cronLogger.info('[RoundAttendanceReward] User already received bonus', {
              userId: user.id,
              suiAddress: user.suiAddress,
              roundId,
            });
            continue;
          }

          // 2-2. Sui 주소 확인
          if (!user.suiAddress) {
            cronLogger.warn('[RoundAttendanceReward] User missing suiAddress', {
              userId: user.id,
            });
            failedCount++;
            continue;
          }

          // 2-3. 온체인 mintDel 호출
          let txDigest: string | undefined;
          try {
            cronLogger.info('[RoundAttendanceReward] Calling mintDel', {
              userId: user.id,
              suiAddress: user.suiAddress,
              amount: bonusAmount,
            });
            const mintResult = await mintDel(user.suiAddress, bonusAmount);
            txDigest = mintResult.txDigest;
            cronLogger.info('[RoundAttendanceReward] Minted DEL on-chain successfully', {
              userId: user.id,
              suiAddress: user.suiAddress,
              amount: bonusAmount,
              txDigest,
            });
          } catch (error) {
            // 온체인 mint 실패 시 에러 로깅하고 다음 사용자로
            cronLogger.error('[RoundAttendanceReward] Failed to mint DEL on-chain', {
              userId: user.id,
              suiAddress: user.suiAddress,
              amount: bonusAmount,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
            failedCount++;
            continue; // 온체인 실패 시 DB 업데이트하지 않음
          }

          // 2-4. 온체인 mint 성공 시 DB 업데이트
          try {
            await this.userRepository.grantRoundLoginBonus(
              user.id,
              roundId,
              bonusAmount,
              txDigest,
            );
            cronLogger.info('[RoundAttendanceReward] DB updated successfully', {
              userId: user.id,
              roundId,
              amount: bonusAmount,
              txDigest,
            });
          } catch (error) {
            cronLogger.error('[RoundAttendanceReward] Failed to update DB', {
              userId: user.id,
              roundId,
              error: error instanceof Error ? error.message : String(error),
            });
            failedCount++;
            continue;
          }

          // 2-5. 잔액 동기화 (온체인 잔액으로 DB 업데이트)
          try {
            const { registry } = await import('@/lib/registry');
            const onChainBalance = await registry.suiService.getDelBalance(user.suiAddress);
            await this.userRepository.updateBalance(user.id, onChainBalance);
            cronLogger.info('[RoundAttendanceReward] Balance synced', {
              userId: user.id,
              onChainBalance,
            });
          } catch (error) {
            // 잔액 동기화 실패는 로깅만 하고 계속 진행
            cronLogger.warn('[RoundAttendanceReward] Failed to sync balance', {
              userId: user.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          grantedCount++;
          cronLogger.info('[RoundAttendanceReward] Successfully granted reward', {
            userId: user.id,
            roundId,
            grantedCount,
          });
        } catch (error) {
          // 개별 사용자 처리 실패는 로깅만 하고 계속 진행
          cronLogger.error('[RoundAttendanceReward] Failed to grant reward to user', {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          failedCount++;
        }
      }

      cronLogger.info('[RoundAttendanceReward] Completed', {
        roundId,
        grantedCount,
        failedCount,
        totalActiveUsers: activeUsers.length,
      });

      return { grantedCount, failedCount };
    } catch (error) {
      cronLogger.error('[RoundAttendanceReward] Fatal error', {
        roundId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { grantedCount, failedCount };
    }
  }
}
