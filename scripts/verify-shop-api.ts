import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import DatabaseConstructor from 'better-sqlite3';
import { eq } from 'drizzle-orm';

const sqlite = new DatabaseConstructor('delta.db');
const db = drizzle(sqlite, { schema });

async function verifyShopApi() {
  console.log('🔍 Verifying Shop API Logic...');

  // 1. DB에서 아이템 가져오기 (API 로직 흉내)
  const items = await db
    .select()
    .from(schema.shopItems)
    .where(eq(schema.shopItems.available, true));

  console.log(`✅ Total items in DB: ${items.length}`);

  // 2. API 로직 적용 (Tier 정렬 및 그룹화)
  const tierOrder: Record<string, number> = {
    Obsidian: 1,
    Aurum: 2,
    Nova: 3,
    Aetherion: 4,
    Singularity: 5,
  };

  type ShopItem = typeof items[number];
  const groupedItems: Record<string, ShopItem[]> = {};

  ['NICKNAME', 'COLOR', 'NFT', 'BOOST', 'ITEM'].forEach((cat) => {
    groupedItems[cat] = [];
  });

  items.forEach((item) => {
    if (!groupedItems[item.category]) {
      groupedItems[item.category] = [];
    }
    groupedItems[item.category].push(item);
  });

  Object.keys(groupedItems).forEach((category) => {
    groupedItems[category].sort((a, b) => {
      if (category === 'NFT') {
        const tierA = tierOrder[a.tier || ''] || 99;
        const tierB = tierOrder[b.tier || ''] || 99;
        return tierA - tierB;
      }
      return a.price - b.price;
    });
  });

  // 3. 검증
  console.log('\n📊 Grouped Items Verification:');

  // NFT 정렬 확인
  console.log('  [NFT] Checking Tier Order:');
  const nftItems = groupedItems['NFT'];
  let prevTierVal = 0;
  let isSorted = true;

  nftItems.forEach((item) => {
    const tierVal = tierOrder[item.tier || ''] || 99;
    console.log(`    - ${item.name} (${item.tier}) -> Order: ${tierVal}`);
    if (tierVal < prevTierVal) isSorted = false;
    prevTierVal = tierVal;
  });

  if (isSorted) {
    console.log('    ✅ NFT items are correctly sorted by Tier!');
  } else {
    console.error('    ❌ NFT items are NOT sorted correctly!');
  }

  // 다른 카테고리 확인
  ['NICKNAME', 'COLOR', 'BOOST'].forEach((cat) => {
    console.log(`  [${cat}] Count: ${groupedItems[cat].length}`);
  });

  console.log('\n✅ API Logic Verification Complete!');
}

verifyShopApi().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
