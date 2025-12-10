import { UserRepository } from './repository';
import type { User } from '@/db/schema/users';
import { registry } from '@/lib/registry';

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
   */
  async checkAndGrantRoundLoginBonus(
    userId: string,
  ): Promise<{ granted: boolean; roundId?: string }> {
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

      // 3. 보상 지급 (5000 DEL)
      const bonusAmount = 5000;
      await this.userRepository.grantRoundLoginBonus(userId, currentRound.id, bonusAmount);

      return { granted: true, roundId: currentRound.id };
    } catch (error) {
      // 에러가 발생해도 로그인은 계속 진행되도록 에러를 로깅만 하고 반환
      console.error('[UserService] Failed to grant round login bonus:', error);
      return { granted: false };
    }
  }
}
