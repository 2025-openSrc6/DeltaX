import { Transaction } from '@mysten/sui/transactions';
import type { BetPrediction } from './types';

const PACKAGE_ID = process.env.SUI_PACKAGE_ID!;
const CLOCK_OBJECT_ID = '0x6';

// Platform wallet address (receives DEL from shop purchases)
const PLATFORM_ADDRESS = process.env.SUI_ADMIN_ADDRESS || '0xb092f93ec3605a42c99d421ccbec14a33db7eaf0ba7296c570934122f22dfd8b';

interface BetParams {
  userAddress: string;
  poolId: string;
  prediction: BetPrediction; // 1 (GOLD) or 2 (BTC)
  userDelCoinId: string;
}

export function buildPlaceBetTx({ userAddress, poolId, prediction, userDelCoinId }: BetParams) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::betting::place_bet`,
    arguments: [
      tx.object(poolId), // Shared Object
      tx.pure.address(userAddress), // Explicit Type!
      tx.pure.u8(prediction), // Explicit Type! (그냥 pure 쓰면 u64로 들어가서 깨짐)
      tx.object(userDelCoinId), // User's DEL Coin
      tx.object(CLOCK_OBJECT_ID), // Clock
    ],
  });

  tx.setSender(userAddress); // 서명자 지정
  return tx;
}

// ============ Claim Payout ============

interface ClaimParams {
  userAddress: string;
  poolId: string;
  settlementId: string;
  betObjectId: string;
}

export function buildClaimPayoutTx({
  userAddress,
  poolId,
  settlementId,
  betObjectId,
}: ClaimParams) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::betting::claim_payout`,
    arguments: [
      tx.object(poolId), // Shared &mut BettingPool
      tx.object(settlementId), // Shared &Settlement
      tx.object(betObjectId), // Owned Bet (consumed)
      tx.object(CLOCK_OBJECT_ID), // Clock
    ],
  });

  tx.setSender(userAddress);
  return tx;
}

// ============ Shop Purchase ============

interface ShopPurchaseParams {
  userAddress: string;
  userDelCoinId: string;
  amount: bigint;
}

/**
 * 상점 구매를 위한 DEL 토큰 전송 트랜잭션을 빌드합니다.
 * 
 * 유저의 DEL 코인에서 필요한 금액을 분리(split)하여 플랫폼 주소로 전송합니다.
 * (이전: TreasuryCap burn → TreasuryCap 권한 문제로 변경)
 */
export function buildShopPurchaseTx({
  userAddress,
  userDelCoinId,
  amount,
}: ShopPurchaseParams) {
  const tx = new Transaction();

  // 1. 유저의 DEL 코인에서 필요한 금액만큼 분리
  const [paymentCoin] = tx.splitCoins(tx.object(userDelCoinId), [tx.pure.u64(amount)]);

  // 2. 분리된 코인을 플랫폼 주소로 전송
  tx.transferObjects([paymentCoin], tx.pure.address(PLATFORM_ADDRESS));

  tx.setSender(userAddress);
  return tx;
}
