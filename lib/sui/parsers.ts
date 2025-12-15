import type { SuiObjectChange, SuiEvent } from '@mysten/sui/client';
import { BusinessRuleError } from '@/lib/shared/errors';

export function findCreatedObjectIdByTypeContains(
  changes: readonly SuiObjectChange[] | undefined,
  options: { contains: string; excludes?: string[] },
): string | null {
  if (!changes) return null;
  const excludes = options.excludes ?? [];
  for (const c of changes) {
    if ((c as { type?: string }).type !== 'created') continue;
    const objectType = (c as { objectType?: string }).objectType;
    const objectId = (c as { objectId?: string }).objectId;
    if (typeof objectType !== 'string' || typeof objectId !== 'string') continue;
    if (!objectType.includes(options.contains)) continue;
    if (excludes.some((ex) => objectType.includes(ex))) continue;
    return objectId;
  }
  return null;
}

/**
 * Parse payout amount from `PayoutDistributed` event.
 *
 * Notes:
 * - claim_payout은 payout=0인 경우 event를 emit하지 않을 수 있음 → 0 반환.
 * - u64 -> JS number 변환 시 안전 정수 범위를 초과하면 에러.
 */
export function parsePayoutDistributedAmount(
  events: readonly SuiEvent[] | undefined,
  options: { eventTypeContains: string },
): number {
  if (!events || events.length === 0) return 0;
  for (const e of events) {
    if (typeof e.type !== 'string' || !e.type.includes(options.eventTypeContains)) continue;
    const amount = (e.parsedJson as { amount?: unknown } | undefined)?.amount;
    if (amount === undefined || amount === null) return 0;

    const amountBigInt = BigInt(typeof amount === 'string' ? amount : String(amount));
    if (amountBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BusinessRuleError('SUI_PARSE_FAILED', 'Payout amount exceeds JS safe integer', {
        amount: amountBigInt.toString(),
      });
    }
    return Number(amountBigInt);
  }
  return 0;
}
