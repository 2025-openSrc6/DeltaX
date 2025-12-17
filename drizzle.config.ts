import { config as loadEnv } from 'dotenv';
import type { Config } from 'drizzle-kit';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

const databaseUrl =
  process.env.DATABASE_URL ||
  // Fallback for local workflows where D1 is managed by wrangler.
  // drizzle-kit generate does not require a live DB connection, but the config schema expects a URL.
  'file:./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/local.sqlite';

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[drizzle] DATABASE_URL is not set; using a default local file URL for drizzle-kit. '
      + 'If you run commands that require DB access (e.g., studio), set DATABASE_URL to your local D1 sqlite file.',
  );
}

export default {
  schema: './db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite', // D1은 SQLite 기반
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
} satisfies Config;
