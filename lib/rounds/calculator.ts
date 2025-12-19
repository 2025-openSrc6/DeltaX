/**
 * 라운드 계산 로직
 *
 * 승자 판정 및 배당 계산
 */

import type { CalculatePayoutParams, CalculatePayoutResult } from './types';

/**
 * 배당 계산
 *
 * 로직:
 * 1. 플랫폼 수수료 = 총 풀 × 수수료율
 * 2. 배당 풀 = 총 풀 - 플랫폼 수수료
 * 3. 배당 비율 = 배당 풀 / 승자 풀
 *
 * 예시:
 * - 총 풀: 1,000,000
 * - 금 베팅: 600,000 / BTC 베팅: 400,000
 * - 승자: GOLD
 * - 수수료: 50,000 (5%)
 * - 배당 풀: 950,000
 * - 배당 비율: 950,000 / 600,000 = 1.583
 * - 금에 100,000 베팅한 사람: 100,000 × 1.583 = 158,333 수령
 *
 * @param params 계산 파라미터
 * @returns 배당 계산 결과
 */
export function calculatePayout(params: CalculatePayoutParams): CalculatePayoutResult {
  const { winner, totalPool, totalGoldBets, totalBtcBets, platformFeeRate } = params;

  // 플랫폼 수수료
  const platformFee = Math.floor(totalPool * platformFeeRate);
  const payoutPool = totalPool - platformFee;

  // 승자/패자 풀
  const winningPool = winner === 'GOLD' ? totalGoldBets : totalBtcBets;
  const losingPool = winner === 'GOLD' ? totalBtcBets : totalGoldBets;

  // 배당 비율
  const payoutRatio = winningPool > 0 ? payoutPool / winningPool : 0;

  return {
    platformFee,
    payoutPool,
    payoutRatio,
    winningPool,
    losingPool,
  };
}

/**
 * 개별 베팅 배당금 계산
 *
 * @param betAmount 베팅 금액
 * @param payoutRatio 배당 비율
 * @returns 배당금 (내림 처리)
 */
export function calculateIndividualPayout(betAmount: number, payoutRatio: number): number {
  return Math.floor(betAmount * payoutRatio);
}
