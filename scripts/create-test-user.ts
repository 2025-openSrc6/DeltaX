<<<<<<< HEAD
/* eslint-disable @typescript-eslint/no-explicit-any */
=======
import { Database } from 'better-sqlite3';
>>>>>>> 7e955ef (feat: Implement NFT Shop with UI, API, and Sui integration)
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import DatabaseConstructor from 'better-sqlite3';

const sqlite = new DatabaseConstructor('delta.db');
const db = drizzle(sqlite, { schema });

async function main() {
<<<<<<< HEAD
  console.log('👤 Creating test user...');

  const testUser = {
    id: 'test-user-id',
    suiAddress: '0x1234567890abcdef1234567890abcdef12345678',
    nickname: 'TestUser',
    delBalance: 1000000, // 1,000,000 DEL
    crystalBalance: 100, // 100 CRYSTAL
  };

  await db.insert(schema.users).values(testUser).onConflictDoUpdate({
    target: schema.users.id,
    set: testUser,
  });

  console.log('✅ Test user created:', testUser);
}

main().catch((err: any) => {
  console.error('❌ Failed to create test user:', err);
  process.exit(1);
=======
    console.log('👤 Creating test user...');

    const testUser = {
        id: 'test-user-id',
        suiAddress: '0x1234567890abcdef1234567890abcdef12345678',
        nickname: 'TestUser',
        delBalance: 1000000, // 1,000,000 DEL
        crystalBalance: 100, // 100 CRYSTAL
    };

    await db
        .insert(schema.users)
        .values(testUser)
        .onConflictDoUpdate({
            target: schema.users.id,
            set: testUser,
        });

    console.log('✅ Test user created:', testUser);
}

main().catch((err) => {
    console.error('❌ Failed to create test user:', err);
    process.exit(1);
>>>>>>> 7e955ef (feat: Implement NFT Shop with UI, API, and Sui integration)
});
