import { describe, expect, it } from 'vitest';
import { findCreatedObjectIdByTypeContains, parsePayoutDistributedAmount } from '@/lib/sui/parsers';

describe('lib/sui/parsers', () => {
  it('findCreatedObjectIdByTypeContains finds created object id by type contains', () => {
    const changes = [
      {
        type: 'created',
        objectType: '0x123::betting::BettingPool',
        objectId: '0xpool',
      },
      {
        type: 'created',
        objectType: '0x123::betting::Bet',
        objectId: '0xbet',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    const betId = findCreatedObjectIdByTypeContains(changes, {
      contains: '::betting::Bet',
      excludes: ['::betting::BettingPool'],
    });

    expect(betId).toBe('0xbet');
  });

  it('parsePayoutDistributedAmount returns 0 when event missing (payout=0 case)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = [] as any;
    const amount = parsePayoutDistributedAmount(events, {
      eventTypeContains: '::betting::PayoutDistributed',
    });
    expect(amount).toBe(0);
  });

  it('parsePayoutDistributedAmount parses u64 amount from event', () => {
    const events = [
      {
        type: '0x123::betting::PayoutDistributed',
        parsedJson: { amount: '1234' },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;
    const amount = parsePayoutDistributedAmount(events, {
      eventTypeContains: '::betting::PayoutDistributed',
    });
    expect(amount).toBe(1234);
  });
});
