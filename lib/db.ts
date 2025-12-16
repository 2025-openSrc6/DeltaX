import { initializeDb } from '@/db/client';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cache } from 'react';
import type { D1Database } from '@cloudflare/workers-types';

export type DbClient = ReturnType<typeof initializeDb>;

interface CloudflareEnv {
  DB: D1Database;
}

/**
 * API 라우트에서 DB 클라이언트를 초기화합니다
 *
 * - 로컬 개발 & 프로덕션: Cloudflare D1 사용 (단일 환경)
 * - next.config.ts의 initOpenNextCloudflareForDev()로 로컬 D1 바인딩 활성화
 *
 * @example
 * ```typescript
 * import { getDb } from "@/lib/db";
 *
 * export async function GET(request: Request) {
 *   const db = getDb();
 *   const rounds = await db.select().from(rounds);
 *   return Response.json(rounds);
 * }
 * ```
 */
export const getDb = cache((): DbClient => {
  try {
    const { env } = getCloudflareContext();
    const db = (env as CloudflareEnv).DB as D1Database | undefined;

    if (!db) {
      throw new Error(
        'D1 database not available. ' +
        'Make sure to run "npx wrangler d1 migrations apply DB --local" and restart dev server.',
      );
    }

    const envType = process.env.NODE_ENV === 'development' ? 'local' : 'remote';
    console.log(`[DB] Using Cloudflare D1 database (${envType})`);
    return initializeDb({ DB: db });
  } catch (error) {
    console.error('[DB] Failed to initialize D1:', error);
    throw new Error(
      `Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
      'Ensure D1 is properly configured in wrangler.toml and migrations are applied.',
    );
  }
});
