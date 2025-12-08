/**
 * ⚠️ DEPRECATED - 더 이상 사용하지 않음
 *
 * 이 파일은 better-sqlite3 기반 로컬 DB를 위한 것이었으나,
 * 현재는 로컬/프로덕션 모두 Cloudflare D1을 사용합니다.
 *
 * 삭제하지 않고 유지하는 이유:
 * - Drizzle Studio가 아직 D1을 직접 지원하지 않아 better-sqlite3 필요
 * - 향후 Drizzle이 D1을 지원하면 이 파일과 better-sqlite3 의존성 제거 예정
 *
 * @deprecated Use getDb() from '@/lib/db' instead
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '@/db/schema';
import path from 'path';

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * @deprecated 로컬 개발용 better-sqlite3 DB 클라이언트 (더 이상 사용 안 함)
 */
export function getLocalDb() {
  if (_db) return _db;

  const dbPath = path.join(process.cwd(), 'delta.db');
  const sqlite = new Database(dbPath);

  // WAL 모드 활성화 (동시성 개선)
  sqlite.pragma('journal_mode = WAL');

  _db = drizzle(sqlite, { schema });
  return _db;
}

export type LocalDbClient = ReturnType<typeof getLocalDb>;
