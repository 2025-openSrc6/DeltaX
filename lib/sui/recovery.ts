import { suiClient } from './client';
import { sleep } from './utils';
import { BusinessRuleError } from '@/lib/shared/errors';
import { findCreatedObjectIdByTypeContains, parsePayoutDistributedAmount } from './parsers';

export type RecoveryTxBlock = {
  effects?: { status?: { status?: 'success' | 'failure'; error?: unknown } };
  objectChanges?: unknown;
  events?: unknown;
  timestampMs?: string;
};

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new BusinessRuleError('ENV_MISSING', `${name} is not configured`);
  return val;
}

export async function fetchTransactionBlockForRecovery(
  digest: string,
  retries = 3,
  delayMs = 1000,
) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await suiClient.getTransactionBlock({
        digest,
        options: { showEffects: true, showObjectChanges: true, showEvents: true },
      });
      const status = res?.effects?.status;
      if (status?.status === 'success') return res;
      if (status?.status === 'failure') {
        throw new BusinessRuleError('SUI_EXECUTE_FAILED', 'Sui execution failed on chain', {
          digest,
          error: status.error,
        });
      }
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      // retry for transport errors
    }
    await sleep(delayMs);
  }
  throw new BusinessRuleError('SUI_TX_NOT_FOUND', 'Transaction not found for recovery', { digest });
}

export function parseCreatedPoolIdFromTx(
  tx: Pick<RecoveryTxBlock, 'objectChanges'>,
): string | null {
  return findCreatedObjectIdByTypeContains(tx.objectChanges as unknown as never, {
    contains: '::betting::BettingPool',
  });
}

export function parseCreatedSettlementIdFromTx(
  tx: Pick<RecoveryTxBlock, 'objectChanges'>,
): string | null {
  return findCreatedObjectIdByTypeContains(tx.objectChanges as unknown as never, {
    contains: '::betting::Settlement',
  });
}

export function parseCreatedFeeCoinIdFromTx(
  tx: Pick<RecoveryTxBlock, 'objectChanges'>,
): string | null {
  const packageId = requireEnv('SUI_PACKAGE_ID');
  const delCoinTypeContains = `::coin::Coin<${packageId}::del::DEL>`;
  return findCreatedObjectIdByTypeContains(tx.objectChanges as unknown as never, {
    contains: delCoinTypeContains,
  });
}

export function parseCreatedBetObjectIdFromTx(
  tx: Pick<RecoveryTxBlock, 'objectChanges'>,
): string | null {
  return findCreatedObjectIdByTypeContains(tx.objectChanges as unknown as never, {
    contains: '::betting::Bet',
    excludes: ['::betting::BettingPool'],
  });
}

export function parseClaimPayoutAmountFromTx(tx: Pick<RecoveryTxBlock, 'events'>): number {
  return parsePayoutDistributedAmount(tx.events as unknown as never, {
    eventTypeContains: '::betting::PayoutDistributed',
  });
}
