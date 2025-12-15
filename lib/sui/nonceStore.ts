import { Redis } from '@upstash/redis';

export interface PreparedTxRecord {
  /**
   * Prepared transaction action type.
   * - 'BET': place_bet
   * - 'CLAIM': claim_payout
   *
   * Backward compat:
   * - 기존 레코드에는 action이 없을 수 있으므로, consume 시에는 undefined를 'BET'으로 간주한다.
   */
  action?: 'BET' | 'CLAIM';
  txBytesHash: string;
  expiresAt: number;
  betId: string;
  userId: string;
}

export interface NonceStore {
  save(nonce: string, record: PreparedTxRecord, ttlSeconds: number): Promise<void>;
  consume(nonce: string): Promise<PreparedTxRecord | null>;
}

const KEY_PREFIX = 'sui:prepare:nonce:';

export class UpstashNonceStore implements NonceStore {
  private client: Redis;

  constructor(client?: Redis) {
    this.client = client ?? Redis.fromEnv();
  }

  private key(nonce: string): string {
    return `${KEY_PREFIX}${nonce}`;
  }

  async save(nonce: string, record: PreparedTxRecord, ttlSeconds: number): Promise<void> {
    await this.client.set(this.key(nonce), record, { ex: ttlSeconds });
  }

  async consume(nonce: string): Promise<PreparedTxRecord | null> {
    const key = this.key(nonce);
    const record = await this.client.getdel<PreparedTxRecord>(key);
    return record ?? null;
  }
}
