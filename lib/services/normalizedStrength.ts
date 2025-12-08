/**
 * 정규화 강도 계산 유틸리티
 *
 * "평소 변동성 대비 얼마나 강하게 움직였나?"를 계산합니다.
 * 이를 통해 PAXG(안정적)와 BTC(변동적)를 공정하게 비교할 수 있습니다.
 */

/**
 * 정규화 강도 계산
 *
 * @param currentReturn 현재 수익률 (%)
 * @param averageVolatility 평소 변동성 (과거 30일 평균 표준편차)
 * @returns 정규화 강도 (1.0 = 평소 수준, 1.5 = 평소의 150%)
 *
 * @example
 * // PAXG가 평소보다 강하게 상승
 * calculateNormalizedStrength(0.45, 0.3) // 1.5 (평소의 150%)
 *
 * // BTC가 평소 수준으로 상승
 * calculateNormalizedStrength(3.5, 3.5) // 1.0 (평소 수준)
 */
export function calculateNormalizedStrength(
  currentReturn: number,
  averageVolatility: number,
): number {
  if (averageVolatility === 0) return 0;
  return currentReturn / averageVolatility;
}

/**
 * 두 자산의 정규화 강도를 비교
 *
 * @param paxgReturn PAXG 수익률
 * @param btcReturn BTC 수익률
 * @param paxgAvgVol PAXG 평균 변동성
 * @param btcAvgVol BTC 평균 변동성
 * @returns 비교 결과
 */
export function compareNormalizedStrength(
  paxgReturn: number,
  btcReturn: number,
  paxgAvgVol: number,
  btcAvgVol: number,
) {
  const paxgStrength = calculateNormalizedStrength(paxgReturn, paxgAvgVol);
  const btcStrength = calculateNormalizedStrength(btcReturn, btcAvgVol);

  const spread = paxgStrength - btcStrength;

  return {
    paxgStrength,
    btcStrength,
    spread,
    winner: spread > 0 ? 'PAXG' : spread < 0 ? 'BTC' : 'TIE',
    confidence: Math.abs(spread), // 격차가 클수록 확실

    // 해석
    paxgInterpretation: getStrengthInterpretation(paxgStrength),
    btcInterpretation: getStrengthInterpretation(btcStrength),
  };
}

/**
 * 정규화 강도 해석
 */
function getStrengthInterpretation(strength: number): string {
  if (strength >= 2.0) return '매우 강함 🔥';
  if (strength >= 1.5) return '강함 💪';
  if (strength >= 1.0) return '평소 수준 ➡️';
  if (strength >= 0.5) return '약함 😐';
  return '매우 약함 😴';
}

/**
 * 과거 N일 동안의 평균 변동성 계산
 *
 * @param prices 가격 배열 (최신순)
 * @param days 계산할 일수
 * @returns 평균 표준편차
 */
export function calculateAverageVolatility(prices: number[], days: number = 30): number {
  if (prices.length < 2) return 0;

  // 일간 수익률 계산
  const returns: number[] = [];
  for (let i = 1; i < Math.min(prices.length, days * 24); i++) {
    const dailyReturn = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
    returns.push(dailyReturn);
  }

  if (returns.length === 0) return 0;

  // 표준편차 계산
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance);
}

/**
 * 정규화 강도 데이터 포인트 타입
 */
export interface NormalizedStrengthDataPoint {
  timestamp: Date;
  paxgStrength: number;
  btcStrength: number;
  paxgReturn: number;
  btcReturn: number;
  spread: number;
  winner: 'PAXG' | 'BTC' | 'TIE';
}

/**
 * 차트용 정규화 강도 데이터 생성
 */
export function createNormalizedStrengthData(
  timestamp: Date,
  paxgReturn: number,
  btcReturn: number,
  paxgAvgVol: number,
  btcAvgVol: number,
): NormalizedStrengthDataPoint {
  const comparison = compareNormalizedStrength(paxgReturn, btcReturn, paxgAvgVol, btcAvgVol);

  return {
    timestamp,
    paxgStrength: comparison.paxgStrength,
    btcStrength: comparison.btcStrength,
    paxgReturn,
    btcReturn,
    spread: comparison.spread,
    winner: comparison.winner as 'PAXG' | 'BTC' | 'TIE',
  };
}
