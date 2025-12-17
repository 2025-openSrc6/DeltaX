/**
 * Admin (Cron) Sui Wrapper
 *
 * 호출 흐름:
 * cron route -> RoundService/BetService -> (this file) -> Sui RPC
 *
 * 책임:
 * - 입력 "형식/범위" 검증 (u64 변환 안전성, 0x id 포맷, finite number 등)
 * - 스케일링(가격*100, avgVol*10_000) + u64 가드
 * - tx build/dryRun/execute/확정(getTransactionBlock) + objectChanges 파싱
 *
 * 금지:
 * - 라운드 FSM/멱등성 판단(서비스 레이어 책임)
 */

import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { SuiObjectChange } from '@mysten/sui/client';
import { getSponsorKeypair, suiClient } from './client';
import { getGasPayment } from './gas';
import { sleep } from './utils';
import { BusinessRuleError } from '@/lib/shared/errors';
import {
  createPoolInputSchema,
  finalizeRoundInputSchema,
  lockPoolInputSchema,
  mintDelInputSchema,
} from './validation';
import type { CreatePoolResult, FinalizeRoundResult, LockPoolResult, MintDelResult } from './types';

const CLOCK_OBJECT_ID = '0x6';

// 스케일링
const PRICE_SCALE = 100;
const AVG_VOL_SCALE = 10_000;
const MIST_SCALE = 1_000_000_000;

const U64_MAX = BigInt('18446744073709551615');
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

// 헲퍼 함수들
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new BusinessRuleError('ENV_MISSING', `${name} is not configured`);
  }
  return val;
}

function getPackageId(): string {
  return requireEnv('SUI_PACKAGE_ID');
}

function getAdminCapId(): string {
  // Backward compat: 문서에 SUI_CAP_OBJECT_ID로도 등장
  const adminCapId = process.env.SUI_ADMIN_CAP_ID ?? process.env.SUI_CAP_OBJECT_ID;
  if (!adminCapId) {
    throw new BusinessRuleError('ENV_MISSING', 'SUI_ADMIN_CAP_ID (or SUI_CAP_OBJECT_ID) missing');
  }
  return adminCapId;
}

function getTreasuryCapId(): string {
  return requireEnv('SUI_TREASURY_CAP_ID');
}

function toU64FromSafeInt(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BusinessRuleError('INVALID_INPUT', `${label} must be a non-negative safe integer`, {
      value,
    });
  }
  const asBigInt = BigInt(value);
  if (asBigInt > U64_MAX) {
    throw new BusinessRuleError('SUI_INPUT_OVERFLOW', `${label} exceeds u64 max`, {
      value,
    });
  }
  return asBigInt;
}

function scaleToU64(
  value: number,
  scale: number,
  label: string,
  options?: { allowZero?: boolean },
): bigint {
  const allowZero = options?.allowZero ?? false;
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new BusinessRuleError(
      'INVALID_INPUT',
      `${label} must be a finite ${allowZero ? 'non-negative' : 'positive'} number`,
      { value },
    );
  }
  const scaledInt = Math.round(value * scale);
  if (!Number.isSafeInteger(scaledInt) || (allowZero ? scaledInt < 0 : scaledInt <= 0)) {
    throw new BusinessRuleError(
      'INVALID_INPUT',
      `${label} scaled result must be a ${allowZero ? 'non-negative' : 'positive'} safe integer`,
      {
        value,
        scale,
        scaledInt,
      },
    );
  }
  if (BigInt(scaledInt) > U64_MAX) {
    throw new BusinessRuleError('SUI_INPUT_OVERFLOW', `${label} exceeds u64 max after scaling`, {
      value,
      scale,
      scaledInt,
    });
  }
  return BigInt(scaledInt);
}

type CreatedObjectChange = Extract<SuiObjectChange, { type: 'created' }> & {
  objectType?: string;
  objectId?: string;
};

function isCreatedChange(change: SuiObjectChange): change is CreatedObjectChange {
  return (change as { type?: string }).type === 'created';
}

function findCreatedObjectIdByType(
  changes: readonly SuiObjectChange[] | undefined,
  contains: string,
) {
  if (!changes) return null;
  const created = changes
    .filter(isCreatedChange)
    .find((c) => typeof c.objectType === 'string' && c.objectType.includes(contains));
  return created?.objectId ?? null;
}

async function ensureOnChain(digest: string, retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await suiClient.getTransactionBlock({
        digest,
        options: { showEffects: true, showObjectChanges: true },
      });
      const status = res?.effects?.status;
      if (status?.status === 'success') return res;
      if (status?.status === 'failure') {
        throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execution failed on chain', {
          error: status.error,
          digest,
        });
      }
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      // transport/availability errors -> retry
    }
    await sleep(delayMs);
  }
  throw new BusinessRuleError('SUI_TX_NOT_FOUND', 'Transaction submitted but not found yet', {
    digest,
  });
}

async function executeAsSponsor(tx: Transaction): Promise<{
  digest: string;
  objectChanges: readonly SuiObjectChange[] | undefined;
}> {
  // sponsor/admin keypair
  let sponsor;
  try {
    sponsor = getSponsorKeypair();
  } catch (error) {
    throw new BusinessRuleError('ENV_MISSING', 'Sui sponsor key is not configured', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const sponsorAddress = sponsor.toSuiAddress();

  // gas
  const gasParams = await getGasPayment(sponsorAddress).catch((error) => {
    throw new BusinessRuleError('NO_GAS_COINS', 'Sponsor has no eligible gas coins', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  tx.setGasPayment(gasParams.gasPayment);
  tx.setGasBudget(gasParams.gasBudget);
  tx.setGasOwner(sponsorAddress);
  tx.setSender(sponsorAddress);

  // build
  const txBytes = await tx.build({ client: suiClient });

  // dry run
  const dryRun = await suiClient.dryRunTransactionBlock({ transactionBlock: txBytes });
  if (dryRun.effects.status.status === 'failure') {
    throw new BusinessRuleError('SUI_DRY_RUN_FAILED', 'Sui dry run failed', {
      error: dryRun.effects.status.error,
    });
  }

  // execute
  // NOTE: WaitForLocalExecution는 timeout이 잦아서 WaitForEffectsCert + 재시도로 안정성을 높인다.
  let executed;
  const sponsorSigned = await sponsor.signTransaction(txBytes);
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      executed = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [sponsorSigned.signature],
        requestType: 'WaitForEffectsCert',
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = /429|rate limit/i.test(message);
      const isTimeout = /timeout|timed out|deadline/i.test(message);
      const isRetryable = isRateLimit || isTimeout || /502|503|504|ECONNRESET|fetch failed/i.test(message);
      if (attempt < maxAttempts && isRetryable) {
        await sleep(300 * attempt);
        continue;
      }
      throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute failed', {
        error: message,
        category: isRateLimit ? 'rate_limit' : isTimeout ? 'timeout' : 'rpc',
        attempt,
        requestType: 'WaitForEffectsCert',
      });
    }
  }

  if (!executed?.digest) {
    throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execute response missing digest');
  }

  const digest = executed.digest;
  const confirmed = await ensureOnChain(digest);
  return { digest, objectChanges: confirmed.objectChanges ?? undefined };
}

// 풀 생성
export async function createPool(
  roundNumber: number,
  lockTimeMs: number,
  endTimeMs: number,
): Promise<CreatePoolResult> {
  const validated = createPoolInputSchema.parse({ roundNumber, lockTimeMs, endTimeMs });
  const packageId = getPackageId();
  const adminCapId = getAdminCapId();

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::betting::create_pool`,
    arguments: [
      tx.object(adminCapId),
      tx.pure.u64(toU64FromSafeInt(validated.roundNumber, 'roundNumber')),
      tx.pure.u64(toU64FromSafeInt(validated.lockTimeMs, 'lockTimeMs')),
      tx.pure.u64(toU64FromSafeInt(validated.endTimeMs, 'endTimeMs')),
    ],
  });

  const { digest, objectChanges } = await executeAsSponsor(tx);

  const poolId = findCreatedObjectIdByType(objectChanges, '::betting::BettingPool');
  if (!poolId) {
    throw new BusinessRuleError('SUI_PARSE_FAILED', 'Failed to parse created BettingPool id', {
      digest,
    });
  }
  return { poolId, txDigest: digest };
}

// 풀 잠금
export async function lockPool(poolId: string): Promise<LockPoolResult> {
  const validated = lockPoolInputSchema.parse({ poolId });
  const packageId = getPackageId();
  const adminCapId = getAdminCapId();

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::betting::lock_pool`,
    arguments: [tx.object(adminCapId), tx.object(validated.poolId), tx.object(CLOCK_OBJECT_ID)],
  });

  const { digest } = await executeAsSponsor(tx);
  return { txDigest: digest };
}

// 라운드 정산
export async function finalizeRound(
  poolId: string,
  prices: { goldStart: number; goldEnd: number; btcStart: number; btcEnd: number },
  avgVols: { goldAvgVol: number; btcAvgVol: number },
  volMeta?: unknown,
): Promise<FinalizeRoundResult> {
  const validated = finalizeRoundInputSchema.parse({ poolId, prices, avgVols, volMeta });
  const packageId = getPackageId();
  const adminCapId = getAdminCapId();
  const feeCollectorAddress =
    process.env.SUI_FEE_COLLECTOR_ADDRESS ?? getSponsorKeypair().toSuiAddress();

  // 스케일링 (Move u64)
  const goldStart = scaleToU64(validated.prices.goldStart, PRICE_SCALE, 'prices.goldStart');
  const goldEnd = scaleToU64(validated.prices.goldEnd, PRICE_SCALE, 'prices.goldEnd');
  const btcStart = scaleToU64(validated.prices.btcStart, PRICE_SCALE, 'prices.btcStart');
  const btcEnd = scaleToU64(validated.prices.btcEnd, PRICE_SCALE, 'prices.btcEnd');

  const goldAvgVol = scaleToU64(validated.avgVols.goldAvgVol, AVG_VOL_SCALE, 'avgVols.goldAvgVol', {
    allowZero: true,
  });
  const btcAvgVol = scaleToU64(validated.avgVols.btcAvgVol, AVG_VOL_SCALE, 'avgVols.btcAvgVol', {
    allowZero: true,
  });

  // 정밀도 안전장치: scale 결과는 MAX_SAFE_INTEGER 범위 내여야 함 (number->BigInt 변환 오차 방지)
  if (
    goldStart > MAX_SAFE_BIGINT ||
    goldEnd > MAX_SAFE_BIGINT ||
    btcStart > MAX_SAFE_BIGINT ||
    btcEnd > MAX_SAFE_BIGINT ||
    goldAvgVol > MAX_SAFE_BIGINT ||
    btcAvgVol > MAX_SAFE_BIGINT
  ) {
    throw new BusinessRuleError(
      'SUI_INPUT_OVERFLOW',
      'Scaled inputs exceed JS safe integer range',
      {
        goldStart: goldStart.toString(),
        goldEnd: goldEnd.toString(),
        btcStart: btcStart.toString(),
        btcEnd: btcEnd.toString(),
        goldAvgVol: goldAvgVol.toString(),
        btcAvgVol: btcAvgVol.toString(),
      },
    );
  }

  const tx = new Transaction();
  const finalizeResults = tx.moveCall({
    target: `${packageId}::betting::finalize_round`,
    arguments: [
      tx.object(adminCapId),
      tx.object(validated.poolId),
      tx.pure.u64(goldStart),
      tx.pure.u64(goldEnd),
      tx.pure.u64(btcStart),
      tx.pure.u64(btcEnd),
      tx.pure.u64(goldAvgVol),
      tx.pure.u64(btcAvgVol),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  const finalizeReturn = finalizeResults as unknown as TransactionObjectArgument[];
  const feeCoinArg = finalizeReturn[1];
  if (!feeCoinArg) {
    throw new BusinessRuleError('SUI_BUILDER_ERROR', 'finalize_round did not return fee coin arg');
  }

  tx.transferObjects([feeCoinArg], tx.pure.address(feeCollectorAddress));

  const { digest, objectChanges } = await executeAsSponsor(tx);

  const settlementId = findCreatedObjectIdByType(objectChanges, '::betting::Settlement');
  if (!settlementId) {
    throw new BusinessRuleError('SUI_PARSE_FAILED', 'Failed to parse created Settlement id', {
      digest,
    });
  }

  const delCoinTypeContains = `::coin::Coin<${packageId}::del::DEL>`;
  const feeCoinId = findCreatedObjectIdByType(objectChanges, delCoinTypeContains);
  if (!feeCoinId) {
    throw new BusinessRuleError('SUI_PARSE_FAILED', 'Failed to parse created fee Coin id', {
      digest,
    });
  }

  return { settlementId, feeCoinId, txDigest: digest };
}

// 배당 지급
// DEL 민팅 (출석 보상)
export async function mintDel(toAddress: string, amount: number): Promise<MintDelResult> {
  const validated = mintDelInputSchema.parse({ toAddress, amount });
  const packageId = getPackageId();
  const treasuryCapId = getTreasuryCapId();

  // Scale amount to MIST (DEL decimals = 9)
  const scaledAmount = Math.round(validated.amount * MIST_SCALE);

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::del::mint`,
    arguments: [
      tx.object(treasuryCapId),
      tx.pure.u64(toU64FromSafeInt(scaledAmount, 'amount')),
      tx.pure.address(validated.toAddress),
    ],
  });

  const { digest } = await executeAsSponsor(tx);
  return { txDigest: digest };
}
