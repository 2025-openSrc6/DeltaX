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
}
