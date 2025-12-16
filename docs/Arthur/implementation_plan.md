# NFT Shop 구현 계획

## 목표

NFT Shop 기능을 구현하여 사용자가 닉네임, 색상, NFT, 부스트, Green Mushroom 아이템 등을 조회하고 DEL 또는 CRYSTAL로 구매할 수 있도록 합니다. **각 아이템 구매 시 해당 효과를 즉시 적용**합니다.

## 요구사항 매핑 (`implementation_need.md`)

| #   | 요구사항                                           | 구현 방식                      |
| --- | -------------------------------------------------- | ------------------------------ |
| 1   | 닉네임 변경 상품 구매 시 닉네임 변경 + DB update   | `users.nickname` 업데이트      |
| 2   | 닉네임 컬러 상품 구매 시 무지개색 변경 + DB update | `users.nicknameColor` 업데이트 |
| 3   | NFT 구매 시 Pinata CID로 minting + DB update       | Sui 민팅 + `achievements` 저장 |
| 4   | 부스트 상품 구매 시 버프 적용 + DB update          | `users.boostUntil` 업데이트    |
| 5   | Green Mushroom 구매 시 + DB update                 | `users.greenMushrooms` +1      |
| 6   | 모든 아이템 tier에 맞게 리스트                     | `shop_items` 테이블로 관리     |

---

## 제안된 변경사항

### 데이터베이스

#### [EXIST] [db/schema/users.ts](file:///c:/2025-openSrc6/backend/db/schema/users.ts)

> [!NOTE]
> 이미 필요한 필드들이 존재합니다 (마이그레이션 `0003_sloppy_moon_knight.sql` 적용됨):

```typescript
/** 닉네임 컬러 (Hex code or 'RAINBOW') */
nicknameColor: text('nickname_color'),

/** 부스트 만료 시간 (Epoch milliseconds) */
boostUntil: integer('boost_until', { mode: 'number' }),

/** Green Mushroom 보유량 */
greenMushrooms: integer('green_mushrooms', { mode: 'number' }).default(0),
```

---

#### [EXIST] [db/schema/shopItems.ts](file:///c:/2025-openSrc6/backend/db/schema/shopItems.ts)

상점 아이템 테이블 (이미 존재):

```typescript
export const shopItems = sqliteTable('shop_items', {
  id: text('id').primaryKey(),
  category: text('category').notNull(), // 'NICKNAME' | 'COLOR' | 'NFT' | 'BOOST' | 'ITEM'
  name: text('name').notNull(),
  description: text('description'),
  price: integer('price').notNull(),
  currency: text('currency').notNull(), // 'DEL' | 'CRYSTAL'
  tier: text('tier'), // NFT용: 'Obsidian' | 'Aurum' | 'Nova' | 'Aetherion' | 'Singularity'
  metadata: text('metadata'), // JSON string (색상 코드, 부스트 기간 등)
  imageUrl: text('image_url'), // Pinata IPFS CID URL
  available: integer('available', { mode: 'boolean' }).default(true),
  requiresNickname: integer('requires_nickname', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at').notNull(),
});
```

**카테고리별 metadata 활용**:

- `COLOR`: `{ "color": "#FF5733" }` 또는 `{ "color": "RAINBOW" }`
- `BOOST`: `{ "durationMs": 86400000 }` (1일 = 86400000ms)
- `NFT`: `{ "pinataCid": "QmXxx..." }`

---

### API 구현

#### [MODIFY] [app/api/nfts/purchase/route.ts](file:///c:/2025-openSrc6/backend/app/api/nfts/purchase/route.ts)

**엔드포인트**: `POST /api/nfts/purchase`

**요청 본문**:

```json
{
  "userId": "user-uuid",
  "itemId": "item_nickname",
  "newNickname": "MyNewName" // NICKNAME 카테고리일 때만 필수
}
```

**🔥 핵심: 카테고리별 효과 적용 로직**:

```typescript
db.transaction(async (tx) => {
  // 1. 공통: 잔액 차감
  const newBalance =
    item.currency === 'DEL' ? user.delBalance - item.price : user.crystalBalance - item.price;

  await tx
    .update(users)
    .set(
      item.currency === 'DEL'
        ? { delBalance: newBalance, updatedAt: Date.now() }
        : { crystalBalance: newBalance, updatedAt: Date.now() },
    )
    .where(eq(users.id, userId));

  // 2. 공통: 포인트 거래 기록
  await tx.insert(pointTransactions).values({
    userId,
    type: 'SHOP_PURCHASE',
    currency: item.currency,
    amount: -item.price,
    balanceBefore: item.currency === 'DEL' ? user.delBalance : user.crystalBalance,
    balanceAfter: newBalance,
    referenceId: item.id,
    referenceType: 'SHOP_ITEM',
  });

  // 3. 카테고리별 효과 적용
  switch (item.category) {
    case 'NICKNAME':
      // ✅ 요구사항 1: 닉네임 변경
      await tx
        .update(users)
        .set({ nickname: newNickname, updatedAt: Date.now() })
        .where(eq(users.id, userId));
      break;

    case 'COLOR':
      // ✅ 요구사항 2: 닉네임 컬러 변경 (무지개색)
      const colorMeta = JSON.parse(item.metadata || '{}');
      await tx
        .update(users)
        .set({ nicknameColor: colorMeta.color || 'RAINBOW', updatedAt: Date.now() })
        .where(eq(users.id, userId));
      break;

    case 'NFT':
      // ✅ 요구사항 3: NFT 민팅 (Pinata CID 사용)
      const nftResult = await mintNFT({
        recipientAddress: user.suiAddress,
        name: item.name,
        tier: item.tier,
        imageUrl: item.imageUrl, // Pinata IPFS URL
      });

      await tx.insert(achievements).values({
        userId,
        type: 'NFT',
        tier: item.tier,
        name: item.name,
        description: item.description,
        suiNftObjectId: nftResult.objectId,
        ipfsMetadataUrl: item.imageUrl,
        imageUrl: item.imageUrl,
        purchasePrice: item.price,
        currency: item.currency,
        acquiredAt: Date.now(),
      });
      break;

    case 'BOOST':
      // ✅ 요구사항 4: 부스트 버프 적용
      const boostMeta = JSON.parse(item.metadata || '{}');
      const durationMs = boostMeta.durationMs || 86400000; // 기본 1일
      const currentBoostUntil = user.boostUntil || Date.now();
      const newBoostUntil = Math.max(currentBoostUntil, Date.now()) + durationMs;

      await tx
        .update(users)
        .set({ boostUntil: newBoostUntil, updatedAt: Date.now() })
        .where(eq(users.id, userId));
      break;

    case 'ITEM':
      // ✅ 요구사항 5: Green Mushroom 수량 증가
      await tx
        .update(users)
        .set({
          greenMushrooms: (user.greenMushrooms || 0) + 1,
          updatedAt: Date.now(),
        })
        .where(eq(users.id, userId));
      break;
  }
});
```

---

### NFT 민팅 구현

#### [NEW] [lib/ipfs/pinata.ts](file:///c:/2025-openSrc6/backend/lib/ipfs/pinata.ts)

**Pinata IPFS 연동** (이미지 업로드 & CID 조회):

```typescript
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';

export async function getIPFSUrl(cid: string): string {
  return `${PINATA_GATEWAY}/ipfs/${cid}`;
}

export async function uploadToPinata(file: Buffer, name: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', new Blob([file]), name);

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  });

  const result = await response.json();
  return result.IpfsHash; // CID
}
```

---

#### [NEW] [lib/sui/nft.ts](file:///c:/2025-openSrc6/backend/lib/sui/nft.ts)

**Sui NFT 민팅 헬퍼**:

```typescript
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const PACKAGE_ID = process.env.SUI_NFT_PACKAGE_ID!;
const ADMIN_PRIVATE_KEY = process.env.SUI_ADMIN_PRIVATE_KEY!;

interface MintParams {
  recipientAddress: string;
  name: string;
  tier: string;
  imageUrl: string; // Pinata IPFS URL
}

interface MintResult {
  objectId: string;
  txDigest: string;
}

export async function mintNFT(params: MintParams): Promise<MintResult> {
  const client = new SuiClient({ url: getFullnodeUrl('testnet') });
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(ADMIN_PRIVATE_KEY, 'hex'));

  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::nft::mint_nft`,
    arguments: [
      tx.pure.string(params.name),
      tx.pure.string(`DeltaX ${params.tier} NFT`),
      tx.pure.string(params.imageUrl),
      tx.pure.string(params.tier),
      tx.pure.address(params.recipientAddress),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showObjectChanges: true },
  });

  const createdNft = result.objectChanges?.find(
    (change) => change.type === 'created' && change.objectType.includes('DeltaxNFT'),
  );

  return {
    objectId: createdNft?.objectId || '',
    txDigest: result.digest,
  };
}
```

---

#### [EXIST] [contracts/sources/nft.move](file:///c:/2025-openSrc6/backend/contracts/sources/nft.move)

**Sui Move Contract** (Sui Display Standard 사용):

```move
module deltax::nft {
    use std::string::String;
    use sui::display;
    use sui::package;

    public struct DeltaxNFT has key, store {
        id: UID,
        name: String,
        description: String,
        url: String,  // Pinata IPFS URL
        tier: String,
    }

    fun init(otw: NFT, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);
        let mut display = display::new<DeltaxNFT>(&publisher, ctx);

        display::add(&mut display, b"name", b"{name}");
        display::add(&mut display, b"description", b"{description}");
        display::add(&mut display, b"image_url", b"{url}");
        display::add(&mut display, b"tier", b"{tier}");

        display::update_version(&mut display);
        transfer::public_transfer(display, tx_context::sender(ctx));
        transfer::public_transfer(publisher, tx_context::sender(ctx));
    }

    public entry fun mint_nft(
        name: String,
        description: String,
        url: String,
        tier: String,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let nft = DeltaxNFT {
            id: object::new(ctx),
            name,
            description,
            url,
            tier,
        };
        transfer::public_transfer(nft, recipient);
    }
}
```

---

### 시드 데이터

#### [MODIFY] [scripts/seed-shop-items.ts](file:///c:/2025-openSrc6/backend/scripts/seed-shop-items.ts)

**metadata 필드에 효과 정보 추가**:

```typescript
const initialItems = [
  // --- 닉네임 ---
  {
    id: 'item_nickname',
    category: 'NICKNAME',
    name: '닉네임 변경권',
    description: '닉네임을 설정할 수 있습니다.',
    price: 50000,
    currency: 'DEL',
    metadata: null,
    requiresNickname: false,
  },

  // --- 컬러 ---
  {
    id: 'item_color_rainbow',
    category: 'COLOR',
    name: '닉네임 컬러 (무지개)',
    description: '닉네임에 무지개 컬러를 적용합니다.',
    price: 100000,
    currency: 'DEL',
    metadata: JSON.stringify({ color: 'RAINBOW' }),
    requiresNickname: true,
  },

  // --- NFT Tiers (Pinata CID 포함) ---
  {
    id: 'nft_obsidian',
    category: 'NFT',
    name: 'Obsidian Tier NFT',
    tier: 'Obsidian',
    price: 300000,
    currency: 'DEL',
    imageUrl: 'https://gateway.pinata.cloud/ipfs/QmObsidianCID...',
    metadata: JSON.stringify({ pinataCid: 'QmObsidianCID...' }),
  },
  {
    id: 'nft_aurum',
    category: 'NFT',
    name: 'Aurum Tier NFT',
    tier: 'Aurum',
    price: 500000,
    currency: 'DEL',
    imageUrl: 'https://gateway.pinata.cloud/ipfs/QmAurumCID...',
    metadata: JSON.stringify({ pinataCid: 'QmAurumCID...' }),
  },
  {
    id: 'nft_nova',
    category: 'NFT',
    name: 'Nova Tier NFT',
    tier: 'Nova',
    price: 1000000,
    currency: 'DEL',
    imageUrl: 'https://gateway.pinata.cloud/ipfs/QmNovaCID...',
    metadata: JSON.stringify({ pinataCid: 'QmNovaCID...' }),
  },
  {
    id: 'nft_aetherion',
    category: 'NFT',
    name: 'Aetherion Tier NFT',
    tier: 'Aetherion',
    price: 2000000,
    currency: 'DEL',
    imageUrl: 'https://gateway.pinata.cloud/ipfs/QmAetherionCID...',
    metadata: JSON.stringify({ pinataCid: 'QmAetherionCID...' }),
  },
  {
    id: 'nft_singularity',
    category: 'NFT',
    name: 'Singularity Tier NFT',
    tier: 'Singularity',
    price: 100000000,
    currency: 'DEL',
    imageUrl: 'https://gateway.pinata.cloud/ipfs/QmSingularityCID...',
    metadata: JSON.stringify({ pinataCid: 'QmSingularityCID...' }),
  },

  // --- 부스트 (Crystal) ---
  {
    id: 'item_boost_1day',
    category: 'BOOST',
    name: '부스트 토큰 (1일)',
    description: '1일간 베팅 성공 보상 +5%, 출석 포인트 +10%',
    price: 2,
    currency: 'CRYSTAL',
    metadata: JSON.stringify({ durationMs: 86400000 }), // 1일
  },

  // --- Green Mushroom (Crystal) ---
  {
    id: 'item_green_mushroom',
    category: 'ITEM',
    name: 'Green Mushroom',
    description: '베팅 실패 시 투자 금액 50% 회수 (1회)',
    price: 2,
    currency: 'CRYSTAL',
    metadata: null,
  },
];
```

---

## 검증 계획

### 자동화 테스트

```bash
# 개발 서버 실행
npm run dev
```

#### 1. 닉네임 변경 테스트

```bash
# 닉네임 변경권 구매
curl -X POST http://localhost:3000/api/nfts/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "itemId": "item_nickname",
    "newNickname": "TestNickname"
  }'

# 검증: users 테이블에서 nickname 확인
sqlite3 delta.db "SELECT nickname FROM users WHERE id = 'test-user-id';"
# 기대값: TestNickname
```

#### 2. 닉네임 컬러 테스트

```bash
curl -X POST http://localhost:3000/api/nfts/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "itemId": "item_color_rainbow"
  }'

# 검증: users 테이블에서 nickname_color 확인
sqlite3 delta.db "SELECT nickname_color FROM users WHERE id = 'test-user-id';"
# 기대값: RAINBOW
```

#### 3. 부스트 테스트

```bash
curl -X POST http://localhost:3000/api/nfts/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "itemId": "item_boost_1day"
  }'

# 검증: users 테이블에서 boost_until 확인
sqlite3 delta.db "SELECT boost_until FROM users WHERE id = 'test-user-id';"
# 기대값: 현재시각 + 86400000 (1일 후 timestamp)
```

#### 4. Green Mushroom 테스트

```bash
curl -X POST http://localhost:3000/api/nfts/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "itemId": "item_green_mushroom"
  }'

# 검증: users 테이블에서 green_mushrooms 확인
sqlite3 delta.db "SELECT green_mushrooms FROM users WHERE id = 'test-user-id';"
# 기대값: 이전값 + 1
```

#### 5. NFT 민팅 테스트

```bash
curl -X POST http://localhost:3000/api/nfts/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "itemId": "nft_obsidian"
  }'

# 검증 1: achievements 테이블 확인
sqlite3 delta.db "SELECT sui_nft_object_id, ipfs_metadata_url FROM achievements WHERE user_id = 'test-user-id' AND type = 'NFT';"

# 검증 2: Sui Explorer에서 NFT Object ID 확인
# https://suiscan.xyz/testnet/object/{objectId}
```

### 수동 검증

**Drizzle Studio**:

```bash
npm run db:studio
```

- `users` 테이블: `nickname`, `nicknameColor`, `boostUntil`, `greenMushrooms` 필드 확인
- `achievements` 테이블: NFT 구매 기록 확인
- `point_transactions` 테이블: 거래 기록 확인

---

## 환경 변수

```env
# .env.local
PINATA_JWT=your_pinata_jwt_token
PINATA_GATEWAY=https://gateway.pinata.cloud
SUI_NFT_PACKAGE_ID=0x...your_deployed_package_id
SUI_ADMIN_PRIVATE_KEY=your_admin_wallet_private_key_hex
```
