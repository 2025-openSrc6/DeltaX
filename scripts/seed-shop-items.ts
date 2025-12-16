import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import DatabaseConstructor from 'better-sqlite3';

const sqlite = new DatabaseConstructor('delta.db');
const db = drizzle(sqlite, { schema });

const initialItems: any[] = [
  // --- 닉네임 & 컬러 ---
  {
    id: 'item_nickname',
    category: 'NICKNAME',
    name: '닉네임 변경권',
    description: '닉네임을 설정할 수 있습니다.',
    price: 50000,
    currency: 'DEL',
    requiresNickname: false,
    imageUrl:
      'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=500&auto=format&fit=crop&q=60',
  },
  {
    id: 'item_color_single',
    category: 'COLOR',
    name: '닉네임 컬러 (단색)',
    description: '닉네임에 단색 컬러를 적용합니다.',
    price: 20000,
    currency: 'DEL',
    requiresNickname: true,
    metadata: JSON.stringify({ color: '#FF5733' }),
    imageUrl:
      'https://images.unsplash.com/photo-1505909182942-e2f09aee3e89?w=500&auto=format&fit=crop&q=60',
  },
  {
    id: 'item_color_special',
    category: 'COLOR',
    name: '닉네임 컬러 (스페셜)',
    description: '2중/3중/무지개 컬러를 적용합니다.',
    price: 100000,
    currency: 'DEL',
    requiresNickname: true,
    metadata: JSON.stringify({ color: 'RAINBOW' }),
    imageUrl:
      'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=500&auto=format&fit=crop&q=60',
  },

  // --- NFT Tiers (IPFS URLs from Pinata) ---
  {
    id: 'nft_obsidian',
    category: 'NFT',
    name: 'Obsidian Tier NFT',
    tier: 'Obsidian',
    price: 300000,
    currency: 'DEL',
    imageUrl: 'ipfs://bafybeihhwd3ivt5k6s6qnj3yscm3wtretf2bzdmostflwicfar4t6vmcjy', // tiger - obsidian.png
  },
  {
    id: 'nft_aurum',
    category: 'NFT',
    name: 'Aurum Tier NFT',
    tier: 'Aurum',
    price: 500000,
    currency: 'DEL',
    imageUrl: 'ipfs://bafybeihfdmhzmkqzomzq3s2jvy2o7pjtshnhx63wwd5y66j7hrh2ftsysi', // blue dragon - aurum.png
  },
  {
    id: 'nft_nova',
    category: 'NFT',
    name: 'Nova Tier NFT',
    tier: 'Nova',
    price: 1000000,
    currency: 'DEL',
    imageUrl: 'ipfs://bafybeibsxr6ztbo6fushzmmqpwptddxtam5oimvnamuntqfhzoajsqi3aa', // sky - nova.png
  },
  {
    id: 'nft_aetherion',
    category: 'NFT',
    name: 'Aetherion Tier NFT',
    tier: 'Aetherion',
    price: 2000000,
    currency: 'DEL',
    imageUrl: 'ipfs://bafybeidkisur3ziwdnicakyhcuaxejlbnyonb4t4xnhmobjl7inkny24ea', // taegeuk - aetherion.png
  },
  {
    id: 'nft_singularity',
    category: 'NFT',
    name: 'Singularity Tier NFT',
    tier: 'Singularity',
    price: 100000000,
    currency: 'DEL',
    imageUrl: 'ipfs://bafybeih6qzbs2dfazjxvh35ndc6aoatbpb2ilxryhpm2gl27lslx6uypry', // star_singularity.png
  },

  // --- 아이템 (Crystal) ---
  {
    id: 'item_boost_1day',
    category: 'BOOST',
    name: '부스트 토큰 (1일)',
    description: '1일간 베팅 성공 보상 +5%, 출석 포인트 +10%',
    price: 2,
    currency: 'CRYSTAL',
    metadata: JSON.stringify({ durationMs: 86400000 }), // 1일
    imageUrl:
      'https://images.unsplash.com/photo-1639815188546-c43c240ff4df?w=500&auto=format&fit=crop&q=60',
  },
  {
    id: 'item_green_mushroom',
    category: 'ITEM',
    name: 'Green Mushroom',
    description: '베팅 실패 시 투자 금액 50% 회수 (1회)',
    price: 2,
    currency: 'CRYSTAL',
    imageUrl: '/images/item_green_mushroom.png',
  },
];

async function main() {
  console.log('🌱 Seeding shop items...');

  for (const item of initialItems) {
    await db.insert(schema.shopItems).values(item).onConflictDoUpdate({
      target: schema.shopItems.id,
      set: item,
    });
  }

  console.log('✅ Shop items seeded successfully!');
}

main().catch((err: any) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
