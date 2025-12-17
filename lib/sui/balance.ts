/**
 * DEL 토큰 잔액 조회 유틸리티
 *
 * Sui 블록체인에서 DEL 토큰 잔액 및 Coin 객체를 조회합니다.
 */

import { suiClient, PACKAGE_ID } from './client';

// DEL 토큰 coinType (Package ID에서 0x 제거 후 짧은 형태 사용)
const DEL_COIN_TYPE = `${PACKAGE_ID}::del::DEL`;

export interface DelCoinInfo {
  objectId: string;
  balance: bigint;
  version: string;
  digest: string;
}

/**
 * 지갑 주소의 DEL 토큰 총 잔액을 조회합니다.
 *
 * @param ownerAddress - Sui 지갑 주소
 * @returns DEL 토큰 총 잔액 (bigint, decimals 9)
 */
export async function getDelBalance(ownerAddress: string): Promise<bigint> {
  let totalBalance = BigInt(0);
  let cursor: string | null | undefined = undefined;

  do {
    const response = await suiClient.getCoins({
      owner: ownerAddress,
      coinType: DEL_COIN_TYPE,
      cursor,
      limit: 50,
    });

    for (const coin of response.data) {
      totalBalance += BigInt(coin.balance);
    }

    cursor = response.nextCursor;
  } while (cursor);

  return totalBalance;
}

/**
 * 지갑 주소의 모든 DEL Coin 객체를 조회합니다.
 *
 * @param ownerAddress - Sui 지갑 주소
 * @returns DEL Coin 객체 목록 (잔액 내림차순 정렬)
 */
export async function getDelCoins(ownerAddress: string): Promise<DelCoinInfo[]> {
  const coins: DelCoinInfo[] = [];
  let cursor: string | null | undefined = undefined;

  do {
    const response = await suiClient.getCoins({
      owner: ownerAddress,
      coinType: DEL_COIN_TYPE,
      cursor,
      limit: 50,
    });

    for (const coin of response.data) {
      coins.push({
        objectId: coin.coinObjectId,
        balance: BigInt(coin.balance),
        version: coin.version,
        digest: coin.digest,
      });
    }

    cursor = response.nextCursor;
  } while (cursor);

  // 잔액 내림차순 정렬
  coins.sort((a, b) => (b.balance > a.balance ? 1 : -1));

  return coins;
}

/**
 * 특정 금액 이상의 DEL Coin을 선택합니다.
 *
 * @param ownerAddress - Sui 지갑 주소
 * @param amount - 필요한 최소 금액
 * @returns 적합한 Coin 객체 ID 또는 null
 */
export async function selectDelCoin(
  ownerAddress: string,
  amount: bigint,
): Promise<DelCoinInfo | null> {
  const coins = await getDelCoins(ownerAddress);

  // 필요 금액 이상인 첫 번째 코인 반환
  for (const coin of coins) {
    if (coin.balance >= amount) {
      return coin;
    }
  }

  return null;
}

/**
 * DEL 잔액을 사람이 읽기 쉬운 형태로 변환합니다.
 *
 * @param balance - DEL 잔액 (raw, decimals 9)
 * @returns 포맷된 문자열 (예: "1,000.00 DEL")
 */
export function formatDelBalance(balance: bigint): string {
  const DEL_DECIMALS = 9;
  const divisor = BigInt(10 ** DEL_DECIMALS);
  const integerPart = balance / divisor;
  const decimalPart = balance % divisor;

  // 소수점 2자리까지만 표시
  const decimalStr = decimalPart.toString().padStart(DEL_DECIMALS, '0').slice(0, 2);

  return `${integerPart.toLocaleString()}.${decimalStr} DEL`;
}
