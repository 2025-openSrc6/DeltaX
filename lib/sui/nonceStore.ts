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

/**
 * 인메모리 NonceStore (로컬 개발용)
 * Upstash 환경변수가 없을 때 폴백으로 사용
 * globalThis에 저장하여 HMR 시에도 데이터 유지
 */

// HMR 시에도 유지되도록 globalThis 사용
const globalStore = globalThis as typeof globalThis & {
  __nonceStore?: Map<string, { record: PreparedTxRecord; expiresAt: number }>;
};

if (!globalStore.__nonceStore) {
  globalStore.__nonceStore = new Map();
}

export class InMemoryNonceStore implements NonceStore {
  private store: Map<string, { record: PreparedTxRecord; expiresAt: number }>;

  constructor() {
    this.store = globalStore.__nonceStore!;
  }

  async save(nonce: string, record: PreparedTxRecord, ttlSeconds: number): Promise<void> {
    this.store.set(nonce, {
      record,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    console.log(`📝 Nonce saved: ${nonce.slice(0, 8)}... (store size: ${this.store.size})`);
  }

  async consume(nonce: string): Promise<PreparedTxRecord | null> {
    const entry = this.store.get(nonce);
    if (!entry) {
      console.log(`❌ Nonce not found: ${nonce.slice(0, 8)}... (store size: ${this.store.size})`);
      return null;
    }

    this.store.delete(nonce);

    if (Date.now() > entry.expiresAt) {
      console.log(`⏰ Nonce expired: ${nonce.slice(0, 8)}...`);
      return null; // 만료됨
    }

    console.log(`✅ Nonce consumed: ${nonce.slice(0, 8)}...`);
    return entry.record;
  }
}

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

/**
 * NonceStore 팩토리 함수
 * Upstash 환경변수가 있으면 UpstashNonceStore, 없으면 InMemoryNonceStore 반환
 */
export function createNonceStore(): NonceStore {
  const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

  if (hasUpstash) {
    console.log('📦 Using UpstashNonceStore');
    return new UpstashNonceStore();
  }

  console.log('⚠️ Upstash not configured, using InMemoryNonceStore (local dev only)');
  return new InMemoryNonceStore();
}
