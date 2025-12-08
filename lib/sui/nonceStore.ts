import { Redis } from '@upstash/redis';

export interface PreparedTxRecord {
  txBytesHash: string;
  expiresAt: number;
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
    const record = await this.client.get<PreparedTxRecord>(key);
    if (record) {
      await this.client.del(key);
    }
    return record ?? null;
  }
}
