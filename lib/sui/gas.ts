import { suiClient } from './client';

const GAS_BUDGET = 50_000_000; // 0.05 SUI (넉넉하게)

export async function getGasPayment(sponsorAddress: string) {
  // 1. 스폰서의 모든 코인 조회
  const coins = await suiClient.getCoins({ owner: sponsorAddress });

  // 2. 가스비(0.05 SUI) 이상 있는 코인만 필터링
  const validCoins = coins.data.filter((c) => BigInt(c.balance) > BigInt(GAS_BUDGET));

  if (validCoins.length === 0) throw new Error('CRITICAL: No gas coins available!');

  // 3. 랜덤 선택 (동시성 충돌 방지)
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
