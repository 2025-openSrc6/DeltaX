/**
 * 코인 선택 유틸리티
 *
 * 베팅에 필요한 코인들을 자동으로 선택하는 로직
 */

// 1 DEL = 10^9 MIST
export const MIST_PER_DEL = BigInt(10 ** 9);

export interface CoinForSelection {
  coinObjectId: string;
  balance: string; // MIST 단위 (문자열)
}

/**
 * 베팅에 필요한 코인들을 자동 선택
 *
 * - 단일 코인으로 충분하면 그것만 반환 (merge 불필요)
 * - 부족하면 큰 순서대로 필요한 만큼만 선택 (최소 merge)
 *
 * @param coins - 사용 가능한 코인 목록
 * @param amountDel - 베팅 금액 (DEL 단위)
 * @returns 선택된 코인 ID 배열
 * @throws Error - 코인 없음 또는 잔액 부족 시
 */
export function selectCoinsForAmount(coins: CoinForSelection[], amountDel: number): string[] {
  const amountMist = BigInt(amountDel) * MIST_PER_DEL;

  if (coins.length === 0) {
    throw new Error('DEL 토큰이 없습니다');
  }

  // 잔액 큰 순으로 정렬
  const sorted = [...coins].sort((a, b) => {
    const diff = BigInt(b.balance) - BigInt(a.balance);
    return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
  });

  // 1. 단일 코인으로 충분한지 확인
  const singleSufficient = sorted.find((c) => BigInt(c.balance) >= amountMist);
  if (singleSufficient) {
    return [singleSufficient.coinObjectId];
  }

  // 2. 여러 코인 필요 - Greedy 선택
  const selected: string[] = [];
  let accumulated = BigInt(0);

  for (const coin of sorted) {
    selected.push(coin.coinObjectId);
    accumulated += BigInt(coin.balance);
    if (accumulated >= amountMist) break;
  }

  // 3. 그래도 부족하면 에러
  if (accumulated < amountMist) {
    const totalBalance = coins.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
    const availableDel = Number(totalBalance / MIST_PER_DEL);
    throw new Error(`잔액이 부족합니다 (보유: ${availableDel} DEL, 필요: ${amountDel} DEL)`);
  }

  return selected;
}
