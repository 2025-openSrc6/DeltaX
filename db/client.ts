import { drizzle } from 'drizzle-orm/d1';
import type { CloudflareEnv } from '@/lib/types';
import * as schema from '@/db/schema';

type DrizzleLogger = {
  logQuery: (query: string, params: unknown[]) => void;
};

/**
 * D1 데이터베이스에 대한 Drizzle ORM 클라이언트를 생성합니다.
 *
 * @param env Cloudflare Worker 환경 변수
 * @returns Drizzle ORM 클라이언트
 *
 * @example
 * ```typescript
 * import { initializeDb } from "@/db/client";
 *
 * export async function GET(request: Request, context: any) {
 *   const env = context.cloudflare?.env as CloudflareEnv;
 *   const db = initializeDb({ DB: env.DB });
 *   const data = await db.select().from(rounds);
 * }
 * ```
 */
export function initializeDb(
  env: CloudflareEnv,
  opts?: {
    /**
     * - true: Drizzle 기본 쿼리 로깅 활성화
     * - false: 로깅 비활성화 (고주기 요청용)
     * - object: 커스텀 로거 (필터/샘플링 등)
     */
    logger?: boolean | DrizzleLogger;
  },
) {
  if (!env.DB) {
    throw new Error("D1 database binding 'DB' is not available");
  }

  return drizzle(env.DB, {
    schema,
    // 기본값: 환경변수로 제어 (고주기 API에서만 별도로 false 주입)
    logger: opts?.logger ?? process.env.DRIZZLE_LOG_QUERIES === 'true',
  });
}

export type DbClient = ReturnType<typeof initializeDb>;
