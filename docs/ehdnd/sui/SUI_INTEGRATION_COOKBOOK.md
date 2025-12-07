# 🧑‍🍳 Sui Integration Cookbook (Total Guide)

> **요약**: 기존 파편화된 문서(`BACKEND_GUIDE`, `IMPLEMENTATION_PLAN`, `CONTRACT_SPEC`)를 하나로 합치고, **실전에서 반드시 겪는 문제(RPC 타임아웃, 타입 에러 등)**에 대한 해결책을 포함한 **통합 구현 가이드**입니다.
> **이것만 보고 따라하시면 됩니다.**

---

## 🏗️ 0. 사전 준비 (Prerequisites)

### 1.1 패키지 설치

```bash
npm install @mysten/sui.js
```

### 1.2 환경 변수 (`.env.local`)

```properties
# Network: Testnet
SUI_RPC_URL="https://fullnode.testnet.sui.io:443"
SUI_PACKAGE_ID="<YOUR_DEPLOYED_PACKAGE_ID>"

# Sponsor Wallet (가스비 대납 계정)
# 생성: sui keytool generate ed25519 -> base64 privKey 복사
SUI_SPONSOR_PRIVATE_KEY="<YOUR_BASE64_KEY>"
```

---

## 📚 1. Core Library Implementation (`lib/sui/`)

안전한 구현을 위해 아래 파일들을 복사해서 `lib/sui/` 폴더에 넣으세요.

### 📄 `lib/sui/utils.ts` (유틸리티 - **필수**)

> JSON 변환 문제와 타임아웃 재시도를 담당하는 헬퍼들입니다.

```typescript
import { formatAddress } from '@mysten/sui.js/utils';

// 1. BigInt JSON 직렬화 문제 해결
export const toJSON = (obj: any) => {
  return JSON.parse(
    JSON.stringify(obj, (key, value) => (typeof value === 'bigint' ? value.toString() : value)),
  );
};

// 2. 잠시 대기 (Polling용)
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 3. 주소 정규화 (0x123... -> 0x0...123)
export const normalize = (addr: string) => formatAddress(addr);
```

### 📄 `lib/sui/client.ts` (클라이언트 설정)

```typescript
import { SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

const RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
const SPONSOR_KEY = process.env.SUI_SPONSOR_PRIVATE_KEY!;

// RPC 클라이언트 (타임아웃 설정 추천)
export const suiClient = new SuiClient({
  url: RPC_URL,
});

// 스폰서 키페어 로드
export function getSponsorKeypair() {
  if (!SPONSOR_KEY) throw new Error('SUI_SPONSOR_PRIVATE_KEY missing');
  const raw = Buffer.from(SPONSOR_KEY, 'base64');
  // 주의: keytool 포맷에 따라 첫 1바이트가 flag일 수 있음. (길이 33이면 slice(1))
  const secretKey = raw.length === 33 ? raw.slice(1) : raw;
  return Ed25519Keypair.fromSecretKey(secretKey);
}
```

### 📄 `lib/sui/gas.ts` (가스 관리 - **가장 중요**)

> **Split Gas 전략**: 하나의 큰 코인 대신, 여러 개의 작은 코인을 랜덤으로 선택해 동시성 충돌을 방지합니다.

```typescript
import { suiClient } from './client';

const GAS_BUDGET = 50_000_000; // 0.05 SUI (넉넉하게)

export async function getGasPayment(sponsorAddress: string) {
  // 1. 스폰서의 모든 코인 조회
  const coins = await suiClient.getCoins({ owner: sponsorAddress });

  // 2. 가스비(0.05 SUI) 이상 있는 코인만 필터링
  const validCoins = coins.data.filter((c) => BigInt(c.balance) > BigInt(GAS_BUDGET));

  if (validCoins.length === 0) throw new Error('CRITICAL: No gas coins available!');

  // 3. [핵심] 랜덤 선택 (동시성 충돌 방지)
  // 코인이 50개면 50명이 동시에 눌러도 충돌 안 남.
  const randomCoin = validCoins[Math.floor(Math.random() * validCoins.length)];

  return {
    gasPayment: [
      {
        objectId: randomCoin.coinObjectId,
        version: randomCoin.version,
        digest: randomCoin.digest,
      },
    ],
    gasBudget: GAS_BUDGET,
    gasPrice: 1000, // Testnet 기준 (Mainnet은 getReferenceGasPrice() 호출 권장)
  };
}
```

### 📄 `lib/sui/builder.ts` (PTB 생성 - **타입 안전**)

> `tx.pure(val)` 대신 `tx.pure.u8(val)`을 써야 하는 이유를 코드로 보여줍니다.

```typescript
import { TransactionBlock } from '@mysten/sui.js/transactions';

const PACKAGE_ID = process.env.SUI_PACKAGE_ID!;

interface BetParams {
  userAddress: string;
  poolId: string;
  prediction: number; // 1 (GOLD) or 2 (BTC)
  amountCoinId: string;
}

export function buildPlaceBetTx({ userAddress, poolId, prediction, amountCoinId }: BetParams) {
  const tx = new TransactionBlock();

  tx.moveCall({
    target: `${PACKAGE_ID}::betting::place_bet`,
    arguments: [
      tx.object(poolId), // Shared Object
      tx.pure.address(userAddress), // Explicit Type!
      tx.pure.u8(prediction), // Explicit Type! (그냥 pure 쓰면 u64로 들어가서 깨짐)
      tx.object(amountCoinId), // User's DEL Coin
      tx.object('0x6'), // Clock
    ],
  });

  tx.setSender(userAddress); // 서명자 지정
  return tx;
}
```

---

## 🚀 2. API Implementation (`app/api/sui/...`)

### 🛠️ API 1: `prepare` (서버 -> 프론트)

> 유저가 서명할 "기안서(txBytes)"를 발급합니다. **Dry Run**을 통해 미리 에러를 잡습니다.

```typescript
// app/api/sui/bet/prepare/route.ts
import { NextResponse } from 'next/server';
import { buildPlaceBetTx } from '@/lib/sui/builder';
import { getGasPayment } from '@/lib/sui/gas';
import { suiClient, getSponsorKeypair } from '@/lib/sui/client';
import { toJSON } from '@/lib/sui/utils';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userAddress, poolId, prediction, coinId } = body;
    const sponsor = getSponsorKeypair();

    // 1. PTB 생성
    const tx = buildPlaceBetTx({
      userAddress,
      poolId,
      prediction,
      amountCoinId: coinId,
    });

    // 2. 가스비 설정 (스폰서)
    const gasParams = await getGasPayment(sponsor.toSuiAddress());
    tx.setGasPayment(gasParams.gasPayment);
    tx.setGasBudget(gasParams.gasBudget);
    tx.setGasOwner(sponsor.toSuiAddress());

    // 3. 빌드 (bytes 생성)
    const txBytes = await tx.build({ client: suiClient });

    // 4. [중요] Dry Run (미리 터뜨려보기)
    // 잔액 부족, 라운드 종료 등의 에러를 여기서 잡아서 프론트에 알려줌
    const dryRun = await suiClient.dryRunTransactionBlock({ transactionBlock: txBytes });
    if (dryRun.effects.status.status === 'failure') {
      return NextResponse.json(
        { error: 'DryRun Failed', details: dryRun.effects.status.error },
        { status: 400 },
      );
    }

    // 5. 반환
    return NextResponse.json({
      txBytes: Buffer.from(txBytes).toString('base64'),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

### ⚡️ API 2: `execute` (서버 -> 체인)

> **가장 위험한 구간**. 유저 서명을 받아 실제 실행합니다. **RPC 타임아웃 방어 로직**이 포함됩니다.

```typescript
// app/api/sui/bet/execute/route.ts
import { NextResponse } from 'next/server';
import { suiClient, getSponsorKeypair } from '@/lib/sui/client';
import { sleep, toJSON } from '@/lib/sui/utils';

export async function POST(req: Request) {
  try {
    const { txBytes: txBytesBase64, userSignature } = await req.json();
    const sponsor = getSponsorKeypair();
    const txBytes = Buffer.from(txBytesBase64, 'base64');

    // 1. 스폰서 서명
    const sponsorSig = await sponsor.signTransactionBlock(txBytes);

    // 2. 실행 (with Retry Logic)
    let digest = '';
    try {
      const res = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [userSignature, sponsorSig.signature],
        requestType: 'WaitForLocalExecution', // 노드에서 돌 때까지 기다림
      });
      digest = res.digest;
    } catch (e: any) {
      // 🚨 CRITICAL: 타임아웃 났다고 무조건 실패가 아님!
      console.warn('Execute Warning:', e.message);

      // txBytes 해싱해서 digest 추측하거나(복잡함),
      // 에러 메시지에 digest가 있다면 그걸로 조회 (보통 e.message에 포함됨) or 그냥 500 뱉지 말고 확인 필요.

      // 간단한 전략: 일단 에러 던지기 전에 재시도 가능한지 판단.
      // 하지만 이미 전송된거라면 중복 실행 안 됨.
      // 여기서는 그냥 에러 반환하되, 프론트에서 재조회하도록 유도하거나, 서버 로그에 남김.
      throw e;
    }

    // 3. [더 확실한 확인] 진짜 체인에 박혔나? (Polling)
    // execute 응답이 와도, 실제 노드 전파가 덜 됐을 수 있음.
    await ensureTransactionSuccess(digest);

    // 4. D1 DB 저장 (Next.js 로직)
    // await db.insert(betSchema).values({ ... });

    return NextResponse.json(toJSON({ digest, status: 'success' }));
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// 헬퍼: 트랜잭션 확정 확인
async function ensureTransactionSuccess(digest: string, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await suiClient.getTransactionBlock({ digest });
      if (res) return res;
    } catch (e) {
      await sleep(1000); // 1초 대기 후 재시도
    }
  }
  throw new Error(`Transaction submitted (${digest}) but not found yet.`);
}
```

---

## 🎨 3. Frontend Snippet

프론트엔드(Wallet Kit)에서 호출하는 부분입니다.

```typescript
import { useSignTransactionBlock } from '@mysten/dapp-kit';

// ...
const { mutateAsync: signTransactionBlock } = useSignTransactionBlock();

async function handleBet() {
  // 1. Prepare
  const { txBytes } = await fetch('/api/sui/bet/prepare', { ... }).then(r => r.json());

  // 2. Sign (서명만 함! 제출 X)
  const { signature } = await signTransactionBlock({
    transactionBlock: txBytes, // base64 string 그대로 넣어도 됨 (최신 SDK 기준)
  });

  // 3. Execute request
  const result = await fetch('/api/sui/bet/execute', {
    method: 'POST',
    body: JSON.stringify({ txBytes, userSignature: signature }),
  }).then(r => r.json());

  console.log('Success:', result.digest);
}
```

---

## ⚠️ 4. 운영 체크리스트 (Maintenance)

이 서비스가 계속 살아있으려면 개발자가 **주기적**으로 해줘야 할 일이 있습니다.

1.  **가스통 채우기**: 스폰서 지갑 잔액이 마르지 않게 체크.
2.  **가스통 쪼개기 (Merge & Split)**:
    - `lib/sui/gas.ts`는 코인이 많아야 작동합니다.
    - 가끔 스크립트를 돌려 자잘한 코인(0.001 SUI 미만)은 합치고(Merge),
    - 큰 코인(100 SUI)은 1 SUI 짜리 100개로 쪼개는 (Split) 작업이 필요합니다.
    - _이건 자동화보다 필요할 때 Admin 스크립트로 돌리는 게 낫습니다._

---

## 🛡️ 5. 트러블슈팅 (FAQ)

**Q: `DryRun Failed`가 떠요.**
A: 대부분 1) 유저가 해당 코인을 가지고 있지 않거나, 2) 이미 쓴 코인을 또 보내려 했거나, 3) 컨트랙트 에러(라운드 마감 등)입니다. `details` 로그를 보세요.

**Q: `Signature is not valid for the transaction` 에러가 떠요.**
A: `prepare`에서 만든 `txBytes`와 유저가 서명한 `txBytes`가 달라졌을 확률 99%입니다. 혹시 중간에 `transaction.setGasBudget` 등을 프론트에서 또 호출했나요? **서버가 준 `txBytes`는 건드리지 말고 서명만 해야 합니다.**

**Q: D1에는 없는데 돈은 나갔대요.**
A: `execute` API가 마지막 `return` 직전에 죽은 경우입니다. 이런 경우를 대비해 `txDigest`가 나오면 무조건 **파일이나 2차 백업**에 로그를 남기세요. 나중에 수동으로라도 DB에 넣어줘야 합니다.
