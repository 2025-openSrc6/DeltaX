<<<<<<< HEAD
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
  console.log('🧪 Testing DB connection...');

  try {
    const items = await db.query.shopItems.findMany();
    console.log('✅ Shop items found:', items.length);
    console.log(items);

    const myItems = await db.query.achievements.findMany();
    console.log('✅ Achievements found:', myItems.length);
    console.log(JSON.stringify(myItems, null, 2));

    const users = await db.query.users.findMany();
    console.log('✅ Users found:', users.length);
  } catch (error) {
    console.error('❌ DB Query failed:', error);
  }
=======
    console.log('🧪 Testing DB connection...');

    try {
        const items = await db.query.shopItems.findMany();
        console.log('✅ Shop items found:', items.length);
        console.log(items);

        const myItems = await db.query.achievements.findMany();
        console.log('✅ Achievements found:', myItems.length);
        console.log(JSON.stringify(myItems, null, 2));

        const users = await db.query.users.findMany();
        console.log('✅ Users found:', users.length);
    } catch (error) {
        console.error('❌ DB Query failed:', error);
    }
>>>>>>> 7e955ef (feat: Implement NFT Shop with UI, API, and Sui integration)
}

main();
