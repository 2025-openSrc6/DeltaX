import { suiClient } from './client';

const GAS_BUDGET = 50_000_000; // 0.05 SUI (넉넉하게)

export async function getGasPayment(sponsorAddress: string) {
  // 1. 스폰서의 코인을 페이지 단위로 조회하며 충분한 잔액의 코인을 찾는다.
  const minBalance = BigInt(GAS_BUDGET);
  const firstPage = await suiClient.getCoins({ owner: sponsorAddress, limit: 50 });
  const validCoins = [...firstPage.data.filter((c) => BigInt(c.balance) > minBalance)];

  let cursor = firstPage.nextCursor;
  while (validCoins.length === 0 && cursor) {
    const page = await suiClient.getCoins({ owner: sponsorAddress, cursor, limit: 50 });
    validCoins.push(...page.data.filter((c) => BigInt(c.balance) > minBalance));
    cursor = page.nextCursor;
  }

  if (validCoins.length === 0) throw new Error('CRITICAL: No gas coins available!');

  // 2. 랜덤 선택 (동시성 충돌 방지)
  const randomCoin = validCoins[Math.floor(Math.random() * validCoins.length)];

  return {
    gasPayment: [
      {
        objectId: randomCoin.coinObjectId,
        version: randomCoin.version,
        digest: randomCoin.digest,
      },
    ],
    gasBudget: GAS_BUDGET,
    gasPrice: 1000, // Testnet 기준 (Mainnet은 getReferenceGasPrice() 호출 권장)
  };
}
