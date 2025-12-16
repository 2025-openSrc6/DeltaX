import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import DatabaseConstructor from 'better-sqlite3';

const sqlite = new DatabaseConstructor('delta.db');
const db = drizzle(sqlite, { schema });

async function verify() {
  console.log('🔍 Verifying shop items...');

  // 1. Shop items 확인
  const items = await db.query.shopItems.findMany();
  console.log(`\n✅ Shop items found: ${items.length}`);

  for (const item of items) {
    console.log(`  - [${item.category}] ${item.name}: ${item.price} ${item.currency}`);
    if (item.metadata) {
      console.log(`    metadata: ${item.metadata}`);
    }
  }

  // 2. Test user 확인
  console.log('\n🔍 Checking test user...');
  const users = await db.query.users.findMany();
  const testUser = users.find((u) => u.id === 'test-user-id');

  if (testUser) {
    console.log(`✅ Test user found:`);
    console.log(`  - ID: ${testUser.id}`);
    console.log(`  - Nickname: ${testUser.nickname}`);
    console.log(`  - Nickname Color: ${testUser.nicknameColor}`);
    console.log(`  - Boost Until: ${testUser.boostUntil}`);
    console.log(`  - Green Mushrooms: ${testUser.greenMushrooms}`);
    console.log(`  - DEL Balance: ${testUser.delBalance}`);
    console.log(`  - Crystal Balance: ${testUser.crystalBalance}`);
  } else {
    console.log('❌ Test user not found');
  }

  // 3. Achievements 확인
  console.log('\n🔍 Checking achievements...');
  const achievements = await db.query.achievements.findMany();
  console.log(`✅ Achievements found: ${achievements.length}`);

  for (const ach of achievements) {
    console.log(`  - [${ach.type}] ${ach.name} (tier: ${ach.tier || 'N/A'})`);
  }

  console.log('\n✅ Verification complete!');
}

verify().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
