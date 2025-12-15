import { Transaction } from '@mysten/sui/transactions';
import type { BetPrediction } from './types';

const PACKAGE_ID = process.env.SUI_PACKAGE_ID!;
const CLOCK_OBJECT_ID = '0x6';

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
