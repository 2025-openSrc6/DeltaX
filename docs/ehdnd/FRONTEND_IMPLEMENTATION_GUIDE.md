# DeltaX 프론트엔드 구현 가이드

> **작성일**: 2025-12-15  
> **Single Source of Truth**: 실제 코드 (`app/api/**/route.ts`, `lib/**`)  
> **주의**: 이 문서는 코드 분석 기반으로 작성됨. 문서와 코드 충돌 시 **코드가 우선**

---

## 목차

1. [프론트 Sitemap/화면 목록](#1-프론트-sitemap화면-목록)
2. [화면별 필수 데이터와 API](#2-화면별-필수-데이터와-api)
3. [컴포넌트/훅 설계](#3-컴포넌트훅-설계)
4. [시퀀스 다이어그램](#4-시퀀스-다이어그램)
5. [에러/엣지케이스 목록과 UX 처리](#5-에러엣지케이스-목록과-ux-처리)
6. [디프리케이트/불일치 정리](#6-디프리케이트불일치-정리)

---

## 1. 프론트 Sitemap/화면 목록

```
/                       # 홈 (현재 라운드 + 공개 베팅 피드)
/rounds                 # 라운드 목록 (히스토리)
/rounds/[id]            # 라운드 상세 (정산 영수증 포함)
/my/bets                # 내 베팅 목록
/my/bets/[id]           # 내 베팅 상세 + Claim UI
```

### 1.1 컴포넌트 구조 개요

```
app/
├── components/
│   ├── wallet/
│   │   ├── WalletProvider.tsx       # @mysten/dapp-kit 래핑
│   │   ├── WalletConnectButton.tsx  # 지갑 연결 버튼
│   │   └── SessionGuard.tsx         # 세션 체크 + 로그인 강제
│   ├── round/
│   │   ├── CurrentRoundCard.tsx     # 현재 라운드 표시
│   │   ├── RoundStatusBadge.tsx     # 상태 배지
│   │   ├── RoundTimer.tsx           # 카운트다운
│   │   └── RoundReceipt.tsx         # 정산 영수증
│   ├── bet/
│   │   ├── BetForm.tsx              # 베팅 폼 (기존 존재)
│   │   ├── BetModal.tsx             # 베팅 모달 플로우
│   │   ├── BetCard.tsx              # 베팅 카드 (피드용)
│   │   ├── MyBetCard.tsx            # 내 베팅 카드 (Claim 버튼 포함)
│   │   └── ClaimButton.tsx          # Claim 버튼 + 상태 표시
│   └── common/
│       ├── LoadingSpinner.tsx
│       ├── ErrorMessage.tsx
│       └── ExplorerLink.tsx         # Sui Explorer 링크
├── hooks/
│   ├── useSession.ts
│   ├── useCurrentRound.ts
│   ├── useBetFlow.ts
│   ├── useClaimFlow.ts
│   ├── useMyBets.ts
│   ├── usePublicFeed.ts
│   └── useUserDelCoins.ts           # 지갑 DEL 코인 조회
```

---

## 2. 화면별 필수 데이터와 API

### 2.1 홈 화면 (`/`)

| 데이터         | API                                  | 인증 | 비고              |
| -------------- | ------------------------------------ | ---- | ----------------- |
| 현재 라운드    | `GET /api/rounds/current?type=6HOUR` | ❌   | UI 계산 필드 포함 |
| 공개 베팅 피드 | `GET /api/bets/public`               | ❌   | 주소 마스킹됨     |
| 세션 정보      | `GET /api/auth/session`              | ❌   | `user: null` 가능 |

#### 현재 라운드 응답 스키마

**근거**: `app/api/rounds/current/route.ts` + `lib/rounds/service.ts#getCurrentRound()`

```typescript
// GET /api/rounds/current?type=6HOUR
interface CurrentRoundResponse {
  success: true;
  data: {
    // 기본 라운드 정보 (db/schema/rounds.ts 참조)
    id: string; // UUID
    roundNumber: number;
    type: '6HOUR';
    status: RoundStatus; // 'SCHEDULED' | 'BETTING_OPEN' | 'BETTING_LOCKED' | ...
    startTime: number; // Epoch ms
    endTime: number; // Epoch ms
    lockTime: number; // Epoch ms
    goldStartPrice: string | null;
    btcStartPrice: string | null;
    goldEndPrice: string | null; // 종료 후
    btcEndPrice: string | null; // 종료 후
    totalPool: number;
    totalGoldBets: number;
    totalBtcBets: number;
    totalBetsCount: number;
    winner: 'GOLD' | 'BTC' | null;

    // Sui 관련 (정산 영수증용)
    suiPoolAddress: string | null;
    suiSettlementObjectId: string | null;
    suiFinalizeTxDigest: string | null;

    // UI 계산 필드 (Service에서 생성)
    timeRemaining: number; // 종료까지 남은 초
    bettingTimeRemaining: number; // 베팅 마감까지 남은 초
    goldBetsPercentage: string; // "45.50"
    btcBetsPercentage: string; // "54.50"
    canBet: boolean; // 베팅 가능 여부
    bettingClosesIn: string; // "MM:SS" 형식
  };
}
```

#### 공개 피드 응답 스키마

**근거**: `app/api/bets/public/route.ts` + `lib/bets/service.ts#getPublicBets()`

```typescript
// GET /api/bets/public?roundId=xxx&page=1&pageSize=20
interface PublicBetsResponse {
  success: true;
  data: PublicBetFeedItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface PublicBetFeedItem {
  id: string;
  roundId: string;
  prediction: 'GOLD' | 'BTC';
  amount: number;
  createdAt: number; // Epoch ms
  chainStatus: 'PENDING' | 'EXECUTED' | 'FAILED';
  resultStatus: 'PENDING' | 'WON' | 'LOST' | 'REFUNDED';
  settlementStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  payoutAmount: number;
  suiTxHash: string | null;
  suiBetObjectId: string | null;
  suiPayoutTxHash: string | null;
  bettor: {
    suiAddressMasked: string; // "0x12ab…89ef"
    nickname: string | null;
  };
}
```

### 2.2 내 베팅 (`/my/bets`)

| 데이터       | API                | 인증 | 비고                   |
| ------------ | ------------------ | ---- | ---------------------- |
| 내 베팅 목록 | `GET /api/me/bets` | ✅   | userId는 세션에서 결정 |

#### 내 베팅 응답 스키마

**근거**: `app/api/me/bets/route.ts` + `lib/bets/service.ts#getMyBets()`

```typescript
// GET /api/me/bets?roundId=xxx&page=1&pageSize=20
interface MyBetsResponse {
  success: true;
  data: Bet[]; // db/schema/bets.ts의 Bet 타입
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface Bet {
  id: string;
  roundId: string;
  userId: string;
  prediction: 'GOLD' | 'BTC';
  amount: number;
  currency: string; // 'DEL'
  resultStatus: string; // 'PENDING' | 'WON' | 'LOST' | 'REFUNDED'
  settlementStatus: string; // 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  payoutAmount: number;
  chainStatus: string; // 'PENDING' | 'EXECUTED' | 'FAILED'
  suiBetObjectId: string | null;
  suiTxHash: string | null;
  suiPayoutTxHash: string | null;
  suiTxTimestamp: number | null;
  suiPayoutTimestamp: number | null;
  createdAt: number;
  processedAt: number;
  settledAt: number | null;
}
```

### 2.3 베팅 상세 (`/my/bets/[id]`)

| 데이터    | API                  | 인증 | 비고             |
| --------- | -------------------- | ---- | ---------------- |
| 베팅 상세 | `GET /api/bets/[id]` | ❌   | 라운드 정보 포함 |

#### 베팅 상세 응답 스키마

**근거**: `app/api/bets/[id]/route.ts` + `lib/bets/service.ts#getBetById()`

```typescript
// GET /api/bets/{betId}
interface BetDetailResponse {
  success: true;
  data: {
    bet: BetWithRound;
  };
}

interface BetWithRound extends Bet {
  round: {
    id: string;
    roundNumber: number;
    type: string;
    status: string;
    startTime: number;
    endTime: number;
  };
}
```

### 2.4 라운드 상세 (`/rounds/[id]`)

| 데이터      | API                    | 인증 | 비고                  |
| ----------- | ---------------------- | ---- | --------------------- |
| 라운드 상세 | `GET /api/rounds/[id]` | ❌   | 정산 영수증 필드 포함 |

#### 라운드 상세 응답 (정산 영수증용 필드)

**근거**: `app/api/rounds/[id]/route.ts` + `db/schema/rounds.ts`

```typescript
// 정산 완료 라운드 (status: 'SETTLED' | 'VOIDED')에서 표시할 필드
interface SettlementReceipt {
  // 체인 검증용
  suiPoolAddress: string;
  suiSettlementObjectId: string;
  suiFinalizeTxDigest: string;
  suiFeeCoinObjectId: string | null;

  // 가격 정보
  goldStartPrice: string;
  goldEndPrice: string;
  btcStartPrice: string;
  btcEndPrice: string;
  goldChangePercent: string; // "0.015" (1.5%)
  btcChangePercent: string;

  // 정산 결과
  winner: 'GOLD' | 'BTC';
  totalPool: number;
  totalGoldBets: number;
  totalBtcBets: number;
  platformFeeCollected: number;
  payoutPool: number;

  // 변동성 정보
  goldAvgVol: number | null;
  btcAvgVol: number | null;
  avgVolMeta: string | null; // JSON text
  priceSnapshotMeta: string | null; // JSON text

  // 타임스탬프
  priceSnapshotStartAt: number | null;
  priceSnapshotEndAt: number | null;
  settlementCompletedAt: number | null;
}
```

---

## 3. 컴포넌트/훅 설계

### 3.1 `useSession()` - 세션 관리

**역할**: 로그인 상태 관리, 세션 조회/생성/종료

```typescript
// hooks/useSession.ts
interface SessionState {
  isLoading: boolean;
  isLoggedIn: boolean;
  user: User | null;
  suiAddress: string | null;
}

interface UseSessionReturn extends SessionState {
  login: (params: LoginParams) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

interface LoginParams {
  suiAddress: string;
  signature: string;
  message: string;
  signedMessageBytes?: string; // base64, zkLogin 등에서 필요
}

// 구현 시 주의사항:
// - GET /api/auth/session 으로 현재 세션 확인
// - POST /api/auth/session 으로 로그인 (쿠키 설정됨)
// - POST /api/auth/logout 으로 로그아웃
```

#### 로그인 메시지 포맷 (필수)

**근거**: `app/api/auth/session/route.ts#parseLoginMessage()`

```typescript
// 서버가 파싱하는 메시지 포맷 - 반드시 이 형식을 따를 것
const LOGIN_TITLE = 'DeltaX Login';
const EXP_PREFIX = 'Exp:';
const NONCE_PREFIX = 'Nonce:';

// 프론트에서 생성할 메시지 예시
function createLoginMessage(): { message: string; nonce: string; exp: number } {
  const nonce = crypto.randomUUID();
  const exp = Date.now() + 5 * 60 * 1000; // 5분 후 만료

  const message = `DeltaX Login
Nonce: ${nonce}
Exp: ${exp}`;

  return { message, nonce, exp };
}

// 지갑 서명 후 서버 전송
const { message, nonce, exp } = createLoginMessage();
const signature = await wallet.signPersonalMessage(message);

await fetch('/api/auth/session', {
  method: 'POST',
  body: JSON.stringify({
    suiAddress: wallet.address,
    signature: signature,
    message: message,
    // zkLogin의 경우 signedMessageBytes도 전송
  }),
});
```

### 3.2 `useWallet()` - 지갑 연결

**역할**: Sui 지갑 연결 상태 관리

```typescript
// hooks/useWallet.ts (또는 @mysten/dapp-kit 직접 사용)
interface UseWalletReturn {
  isConnected: boolean;
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signPersonalMessage: (message: string) => Promise<string>;
  signTransaction: (txBytes: Uint8Array) => Promise<string>;
}

// 주의: 지갑 연결 ≠ 서버 로그인
// - 지갑 연결: 주소 획득
// - 서버 로그인: 메시지 서명 → POST /api/auth/session → 쿠키 설정
```

### 3.3 `useCurrentRound()` - 현재 라운드

**역할**: 현재 활성 라운드 조회 + 실시간 상태 갱신

```typescript
// hooks/useCurrentRound.ts
interface UseCurrentRoundReturn {
  round: CurrentRound | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// 구현 노트:
// - 폴링 주기: 5-10초 권장 (WebSocket 없음)
// - canBet 필드로 베팅 버튼 활성화 결정
// - timeRemaining, bettingTimeRemaining은 로컬에서도 카운트다운 필요
// - status 변경 시 UI 상태 전환 (BETTING_OPEN → BETTING_LOCKED 등)

function useCurrentRound(type: '6HOUR' = '6HOUR') {
  return useQuery({
    queryKey: ['round', 'current', type],
    queryFn: () => fetchCurrentRound(type),
    refetchInterval: 5000, // 5초마다 갱신
    staleTime: 3000,
  });
}
```

### 3.4 `useBetFlow()` - 베팅 플로우

**역할**: Prepare → Sign → Execute 전체 플로우 관리

```typescript
// hooks/useBetFlow.ts
interface BetFlowState {
  step: 'idle' | 'preparing' | 'signing' | 'executing' | 'success' | 'error';
  betId: string | null;
  txBytes: string | null;
  nonce: string | null;
  expiresAt: number | null;
  digest: string | null;
  betObjectId: string | null;
  error: BetFlowError | null;
}

interface BetInput {
  roundId: string;
  prediction: 'GOLD' | 'BTC';
  amount: number;
  userDelCoinId: string; // 필수! 프론트에서 조회해서 전달
}

interface UseBetFlowReturn extends BetFlowState {
  startBet: (input: BetInput) => Promise<void>;
  reset: () => void;
}

// 주의사항:
// 1. userDelCoinId는 프론트에서 지갑의 DEL 코인 오브젝트를 조회해서 전달해야 함
// 2. 현재 tx builder가 코인 split을 하지 않으므로, 정확한 금액의 코인이 필요함
//    → 방안 A: 고정 베팅 단위 (예: 100, 500, 1000 DEL만 허용)
//    → 방안 B: 프론트에서 먼저 split tx 실행 후 베팅
//    → 확인 필요: lib/sui/builder.ts#buildPlaceBetTx()
```

#### `userDelCoinId` 확보 전략

**근거**: `lib/sui/builder.ts` - `userDelCoinId`를 직접 오브젝트로 사용

```typescript
// hooks/useUserDelCoins.ts
// 유저 지갑에서 DEL 코인 오브젝트 목록 조회

interface DelCoin {
  objectId: string;
  balance: number; // smallest unit
}

function useUserDelCoins(address: string | null) {
  return useQuery({
    queryKey: ['delCoins', address],
    queryFn: () => fetchUserDelCoins(address!),
    enabled: !!address,
  });
}

// 방안 A: 고정 단위 베팅
// - 100, 500, 1000 DEL 코인만 표시
// - 해당 금액과 정확히 일치하는 코인만 사용 가능
// - UX: "베팅 가능 코인: 100 DEL x 3개, 500 DEL x 1개"

// 방안 B: split 후 베팅 (복잡)
// - 먼저 splitCoin tx로 원하는 금액 분리
// - 분리된 코인으로 베팅
// - 2단계 tx 필요
```

### 3.5 `useClaimFlow()` - Claim 플로우

**역할**: Claim Prepare → Sign → Execute 관리

```typescript
// hooks/useClaimFlow.ts
interface ClaimFlowState {
  step: 'idle' | 'preparing' | 'signing' | 'executing' | 'success' | 'error';
  txBytes: string | null;
  nonce: string | null;
  expiresAt: number | null;
  digest: string | null;
  payoutAmount: number | null;
  error: ClaimFlowError | null;
}

interface ClaimInput {
  betId: string;
}

interface UseClaimFlowReturn extends ClaimFlowState {
  startClaim: (input: ClaimInput) => Promise<void>;
  reset: () => void;
}
```

#### Claim 가능 조건

**근거**: `lib/bets/service.ts#prepareClaimWithSuiPrepare()`

```typescript
// 프론트에서 Claim 버튼 활성화 조건 (서버 검증과 동일하게)
function canClaim(bet: Bet, round: Round): boolean {
  // 1. 베팅이 체인에 실행됨
  if (bet.chainStatus !== 'EXECUTED') return false;

  // 2. betObjectId가 존재함
  if (!bet.suiBetObjectId) return false;

  // 3. 이미 claim 안 됨
  if (bet.suiPayoutTxHash) return false;

  // 4. 라운드가 SETTLED 또는 VOIDED
  if (round.status !== 'SETTLED' && round.status !== 'VOIDED') return false;

  // 5. Settlement Object가 존재함
  if (!round.suiSettlementObjectId) return false;
  if (!round.suiPoolAddress) return false;

  return true;
}
```

### 3.6 `useMyBets()` / `usePublicFeed()` - 목록 조회

```typescript
// hooks/useMyBets.ts
function useMyBets(params?: BetQueryParams) {
  return useQuery({
    queryKey: ['myBets', params],
    queryFn: () => fetchMyBets(params),
    // 세션 없으면 비활성화
    enabled: !!session?.userId,
  });
}

// hooks/usePublicFeed.ts
function usePublicFeed(params?: PublicFeedParams) {
  return useQuery({
    queryKey: ['publicFeed', params],
    queryFn: () => fetchPublicFeed(params),
    refetchInterval: 10000, // 10초마다
  });
}
```

### 3.7 캐시 무효화 전략

```typescript
// 베팅 성공 후
queryClient.invalidateQueries({ queryKey: ['myBets'] });
queryClient.invalidateQueries({ queryKey: ['round', 'current'] });

// Claim 성공 후
queryClient.invalidateQueries({ queryKey: ['myBets'] });
queryClient.setQueryData(['bet', betId], (old) => ({
  ...old,
  suiPayoutTxHash: digest,
  payoutAmount: payoutAmount,
  settlementStatus: 'COMPLETED',
}));
```

---

## 4. 시퀀스 다이어그램

### 4.1 Login 플로우

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Frontend │    │  Wallet  │    │  Server  │    │   DB     │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │
     │ 1. 지갑 연결 요청  │               │               │
     │──────────────>│               │               │
     │               │               │               │
     │ 2. address 반환  │               │               │
     │<──────────────│               │               │
     │               │               │               │
     │ 3. 로그인 메시지 생성             │               │
     │ (DeltaX Login\n                │               │
     │  Nonce: xxx\n                  │               │
     │  Exp: timestamp)               │               │
     │               │               │               │
     │ 4. signPersonalMessage 요청    │               │
     │──────────────>│               │               │
     │               │               │               │
     │ 5. signature 반환              │               │
     │<──────────────│               │               │
     │               │               │               │
     │ 6. POST /api/auth/session     │               │
     │   { suiAddress, signature,    │               │
     │     message }                 │               │
     │──────────────────────────────>│               │
     │               │               │               │
     │               │               │ 7. 서명 검증  │
     │               │               │   (verifyPersonalMessageSignature)
     │               │               │               │
     │               │               │ 8. users 조회/생성
     │               │               │──────────────>│
     │               │               │<──────────────│
     │               │               │               │
     │ 9. Set-Cookie: suiAddress     │               │
     │    + user 정보                 │               │
     │<──────────────────────────────│               │
     │               │               │               │
```

### 4.2 Bet 플로우

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Frontend │    │  Wallet  │    │  Server  │    │  Redis   │    │   Sui    │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │               │
     │ 1. 베팅 시작 (roundId, prediction, amount, userDelCoinId)     │
     │               │               │               │               │
     │ 2. POST /api/bets             │               │               │
     │──────────────────────────────>│               │               │
     │               │               │               │               │
     │               │               │ 3. 세션 검증   │               │
     │               │               │ 4. 라운드/시간 검증            │
     │               │               │ 5. bets row 생성 (PENDING)    │
     │               │               │ 6. PTB 빌드 + dryRun          │
     │               │               │──────────────────────────────>│
     │               │               │<──────────────────────────────│
     │               │               │               │               │
     │               │               │ 7. nonce 저장 (TTL)           │
     │               │               │──────────────>│               │
     │               │               │               │               │
     │ 8. { betId, txBytes, nonce, expiresAt }      │               │
     │<──────────────────────────────│               │               │
     │               │               │               │               │
     │ 9. signTransaction(txBytes)   │               │               │
     │    ⚠️ 서명만! execute 금지   │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │ 10. userSignature             │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
     │ 11. POST /api/bets/execute    │               │               │
     │    { betId, txBytes,          │               │               │
     │      userSignature, nonce }   │               │               │
     │──────────────────────────────>│               │               │
     │               │               │               │               │
     │               │               │ 12. nonce 소비/검증           │
     │               │               │──────────────>│               │
     │               │               │               │               │
     │               │               │ 13. sponsor 서명 + execute    │
     │               │               │──────────────────────────────>│
     │               │               │<──────────────────────────────│
     │               │               │               │               │
     │               │               │ 14. DB 업데이트               │
     │               │               │    chainStatus=EXECUTED       │
     │               │               │    suiTxHash, suiBetObjectId  │
     │               │               │               │               │
     │ 15. { digest, betObjectId }   │               │               │
     │<──────────────────────────────│               │               │
     │               │               │               │               │
```

### 4.3 Claim 플로우

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Frontend │    │  Wallet  │    │  Server  │    │  Redis   │    │   Sui    │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │               │
     │ 1. Claim 시작 (betId)         │               │               │
     │               │               │               │               │
     │ 2. POST /api/bets/claim/prepare               │               │
     │──────────────────────────────>│               │               │
     │               │               │               │               │
     │               │               │ 3. 세션 검증   │               │
     │               │               │ 4. bet 조회 + 소유자 검증     │
     │               │               │ 5. round 조회 + 상태 검증     │
     │               │               │    (SETTLED | VOIDED)         │
     │               │               │ 6. PTB 빌드 (poolId,          │
     │               │               │    settlementId, betObjectId) │
     │               │               │ 7. dryRun                     │
     │               │               │──────────────────────────────>│
     │               │               │<──────────────────────────────│
     │               │               │               │               │
     │               │               │ 8. nonce 저장 (action: CLAIM) │
     │               │               │──────────────>│               │
     │               │               │               │               │
     │ 9. { txBytes, nonce, expiresAt }             │               │
     │<──────────────────────────────│               │               │
     │               │               │               │               │
     │ 10. signTransaction(txBytes)  │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │ 11. userSignature             │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
     │ 12. POST /api/bets/claim/execute             │               │
     │    { betId, txBytes,          │               │               │
     │      userSignature, nonce }   │               │               │
     │──────────────────────────────>│               │               │
     │               │               │               │               │
     │               │               │ 13. nonce 소비/검증           │
     │               │               │    action==CLAIM 확인         │
     │               │               │──────────────>│               │
     │               │               │               │               │
     │               │               │ 14. sponsor 서명 + execute    │
     │               │               │──────────────────────────────>│
     │               │               │<──────────────────────────────│
     │               │               │               │               │
     │               │               │ 15. PayoutDistributed 이벤트  │
     │               │               │     파싱 → payoutAmount        │
     │               │               │               │               │
     │               │               │ 16. DB 업데이트               │
     │               │               │    suiPayoutTxHash            │
     │               │               │    payoutAmount               │
     │               │               │    resultStatus=WON|LOST|REFUNDED
     │               │               │    settlementStatus=COMPLETED │
     │               │               │               │               │
     │ 17. { digest, payoutAmount }  │               │               │
     │<──────────────────────────────│               │               │
     │               │               │               │               │
```

---

## 5. 에러/엣지케이스 목록과 UX 처리

### 5.1 에러 코드 매핑

**근거**: `lib/shared/errors.ts`, `lib/shared/response.ts`, 각 서비스 코드

| HTTP | Error Code            | 원인                                         | UX 처리                                      |
| ---- | --------------------- | -------------------------------------------- | -------------------------------------------- |
| 400  | `VALIDATION_ERROR`    | 입력값 검증 실패                             | 폼 필드 에러 표시                            |
| 400  | `BETTING_CLOSED`      | 베팅 마감됨 (status≠OPEN 또는 lockTime 경과) | "베팅이 마감되었습니다" + 베팅 버튼 비활성화 |
| 400  | `ALREADY_BET`         | 이미 해당 라운드에 베팅함                    | "이미 베팅하셨습니다"                        |
| 400  | `USER_MISMATCH`       | 세션 유저와 bet 소유자 불일치                | "잘못된 요청입니다" (재로그인 유도)          |
| 400  | `INVALID_NONCE`       | nonce 없거나 이미 사용됨                     | "세션이 만료되었습니다. 다시 시도해주세요"   |
| 400  | `NONCE_EXPIRED`       | nonce TTL 만료                               | "시간이 초과되었습니다. 다시 시도해주세요"   |
| 400  | `TX_MISMATCH`         | txBytes 해시 불일치                          | "트랜잭션이 변조되었습니다" (재시도)         |
| 400  | `BET_MISMATCH`        | betId 불일치                                 | "잘못된 요청입니다"                          |
| 400  | `BET_NOT_EXECUTED`    | 체인 미실행 베팅                             | "베팅이 아직 처리되지 않았습니다"            |
| 400  | `ALREADY_CLAIMED`     | 이미 claim됨                                 | Claim 버튼 숨기고 "정산 완료" 표시           |
| 400  | `ROUND_NOT_CLAIMABLE` | 라운드 상태가 SETTLED/VOIDED 아님            | "아직 정산 중입니다"                         |
| 400  | `POOL_MISSING`        | poolId 누락                                  | "시스템 오류 (관리자 문의)"                  |
| 400  | `SETTLEMENT_MISSING`  | settlementId 누락                            | "아직 정산이 완료되지 않았습니다"            |
| 400  | `SUI_DRY_RUN_FAILED`  | 트랜잭션 시뮬레이션 실패                     | 상세 에러 확인 후 표시                       |
| 400  | `SUI_EXECUTE_FAILED`  | 체인 실행 실패                               | "트랜잭션 실패. 잠시 후 다시 시도해주세요"   |
| 400  | `NO_GAS_COINS`        | 스폰서 가스 부족                             | "시스템 점검 중" (운영 알림 필요)            |
| 401  | `UNAUTHORIZED`        | 로그인 필요                                  | 로그인 모달 표시                             |
| 403  | `FORBIDDEN`           | 권한 없음                                    | "접근 권한이 없습니다"                       |
| 404  | `NOT_FOUND`           | 리소스 없음                                  | 404 페이지 또는 "찾을 수 없습니다"           |
| 410  | `DEPRECATED_JOB`      | Job5 호출 (금지)                             | **호출하지 말 것**                           |

### 5.2 엣지케이스 처리

#### 중복 클릭 방지

```typescript
// useBetFlow 내부
const [isSubmitting, setIsSubmitting] = useState(false);

const startBet = async (input: BetInput) => {
  if (isSubmitting) return;
  setIsSubmitting(true);
  try {
    // ...
  } finally {
    setIsSubmitting(false);
  }
};

// UI
<Button
  disabled={isSubmitting || !canBet}
  onClick={() => startBet(input)}
>
  {isSubmitting ? <Spinner /> : '베팅하기'}
</Button>
```

#### 지갑 주소 ≠ 세션 주소 불일치

```typescript
// 로그인 후 지갑 변경 시 감지
function useWalletSessionSync() {
  const { address: walletAddress } = useWallet();
  const { suiAddress: sessionAddress, logout } = useSession();

  useEffect(() => {
    if (sessionAddress && walletAddress && sessionAddress !== walletAddress) {
      // 방안 A: 자동 로그아웃
      logout();
      toast.warning('지갑이 변경되어 로그아웃되었습니다');

      // 방안 B: 경고만 표시하고 특정 기능 차단
      // setMismatchWarning(true);
    }
  }, [walletAddress, sessionAddress]);
}
```

#### Nonce 만료 재시도

```typescript
const startBet = async (input: BetInput) => {
  try {
    const prepared = await prepareBet(input);
    const signature = await signTransaction(prepared.txBytes);
    await executeBet({ ...prepared, userSignature: signature });
  } catch (error) {
    if (error.code === 'NONCE_EXPIRED' || error.code === 'INVALID_NONCE') {
      // 자동 재시도 (1회)
      toast.info('다시 시도 중...');
      return startBet(input);
    }
    throw error;
  }
};
```

#### 이미 Claimed 표시

```typescript
// MyBetCard.tsx
function MyBetCard({ bet, round }: Props) {
  const isClaimed = !!bet.suiPayoutTxHash;
  const canClaimNow = canClaim(bet, round);

  return (
    <Card>
      {/* ... bet 정보 ... */}

      {isClaimed ? (
        <div className="text-green-500">
          ✓ 정산 완료 ({bet.payoutAmount} DEL)
          <ExplorerLink digest={bet.suiPayoutTxHash} />
        </div>
      ) : canClaimNow ? (
        <ClaimButton betId={bet.id} />
      ) : (
        <div className="text-gray-400">
          {round.status === 'SETTLED' || round.status === 'VOIDED'
            ? '정산 대기 중'
            : '라운드 진행 중'}
        </div>
      )}
    </Card>
  );
}
```

### 5.3 로딩 상태 처리

```typescript
// 각 단계별 로딩 메시지
const STEP_MESSAGES = {
  preparing: '트랜잭션 준비 중...',
  signing: '지갑에서 서명해주세요',
  executing: '트랜잭션 실행 중...',
};

// BetModal.tsx
function BetModal({ step, ... }) {
  return (
    <Modal>
      {step !== 'idle' && step !== 'success' && step !== 'error' && (
        <div className="flex items-center gap-2">
          <Spinner />
          <span>{STEP_MESSAGES[step]}</span>
        </div>
      )}
      {/* ... */}
    </Modal>
  );
}
```

---

## 6. 디프리케이트/불일치 정리

### 6.1 디프리케이트된 엔드포인트

| 엔드포인트                     | 상태         | 대체              | 근거                                  |
| ------------------------------ | ------------ | ----------------- | ------------------------------------- |
| `POST /api/cron/rounds/settle` | **410 Gone** | 사용자 Claim 모델 | `app/api/cron/rounds/settle/route.ts` |

**⚠️ 절대 프론트에서 호출하지 말 것:**

- `/api/cron/*` 경로는 cron job 전용 (X-Cron-Secret 인증 필요)
- Job5(settle)는 폐기됨 - 배당은 유저 Claim으로만 처리

### 6.2 문서 vs 코드 불일치

#### `docs/ehdnd/API_SPECIFICATION.md`

| 문서 내용                | 실제 코드                          | 우선     |
| ------------------------ | ---------------------------------- | -------- |
| `/api/bets/prepare` 경로 | `POST /api/bets`                   | **코드** |
| userId를 body로 전달     | 세션에서 결정 (body의 userId 무시) | **코드** |

#### `docs/ehdnd/sui/SUI_FRONTEND_GUIDE.md`

| 문서 내용         | 실제 코드     | 우선     |
| ----------------- | ------------- | -------- |
| `/api/sui/*` 경로 | 존재하지 않음 | **코드** |

#### `docs/ehdnd/USER_FLOW.md`

| 문서 내용           | 실제 코드         | 우선     |
| ------------------- | ----------------- | -------- |
| 서버 자동 배당 언급 | Claim 모델만 유효 | **코드** |

### 6.3 SETTLED 의미 명확화

**⚠️ 중요**: `status: 'SETTLED'`는 **"전원 지급 완료"가 아님**

```
SETTLED 의미:
- Settlement 오브젝트가 on-chain에 생성됨
- 유저가 Claim 가능한 상태
- 아직 배당금이 지급된 것이 아님!

UI 문구 권장:
- ❌ "정산 완료" (오해 소지)
- ✅ "결과 확정" 또는 "배당 수령 가능"
```

### 6.4 코인 Split 관련 (확인됨)

**근거**: `contracts/sources/betting.move#place_bet()` 라인 286-315

```move
public fun place_bet(
    pool: &mut BettingPool,
    user: address,
    prediction: u8,
    payment: Coin<DEL>,  // ← 코인 전체를 받음
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    // ...
    let amount = coin::value(&payment);  // ← 코인 잔액이 곧 베팅 금액
    assert!(amount >= MIN_BET_AMOUNT, E_INSUFFICIENT_AMOUNT);

    let bet_balance = coin::into_balance(payment);  // ← 코인 전체 소비
    // ...
}
```

**결론**:

- ✅ **확인됨**: 서버/컨트랙트는 코인 split을 하지 않음
- ✅ **확인됨**: `userDelCoinId`의 잔액 전체가 베팅 금액이 됨
- ⚠️ **프론트 필수**: 원하는 베팅 금액과 정확히 일치하는 코인을 찾거나, 먼저 split해야 함

**프론트 구현 방안**:

```typescript
// 방안 A: 고정 단위 베팅 (권장 - 단순)
// - 100, 500, 1000 DEL 단위 버튼만 제공
// - 해당 금액의 코인을 지갑에서 찾아서 사용
// - 없으면 "먼저 코인을 분할하세요" 안내

// 방안 B: 금액 입력 + 자동 split (복잡)
// 1. 유저가 원하는 금액 입력
// 2. 프론트에서 splitCoins tx 실행 → 분할된 코인 objectId 획득
// 3. 분할된 코인으로 베팅 API 호출
```

### 6.5 베팅 금액 제한 (확인됨)

**근거**:

- Move 컨트랙트: `contracts/sources/betting.move` 라인 33
- Zod 스키마: `lib/bets/validation.ts#createBetWithSuiPrepareSchema`

| 제한          | 값                                        | 소스          |
| ------------- | ----------------------------------------- | ------------- |
| 최소 (온체인) | 100 DEL (`100_000_000_000` smallest unit) | Move 컨트랙트 |
| 최소 (서버)   | 100                                       | Zod 스키마    |
| 최대 (서버)   | 1,000,000                                 | Zod 스키마    |

**주의**: DEL 토큰은 **9 decimals** 사용

- 서버 API의 `amount`는 DEL 단위 정수 (예: 100 = 100 DEL)
- 온체인은 smallest unit (예: 100 DEL = `100_000_000_000`)
- 프론트는 DEL 단위로 UI 표시, API 호출 시 그대로 전송

### 6.6 기타 확인 필요 사항

| 항목         | 파일                            | 질문                                                     |
| ------------ | ------------------------------- | -------------------------------------------------------- |
| zkLogin 지원 | `app/api/auth/session/route.ts` | `signedMessageBytes` 필드는 zkLogin 서명 검증용으로 보임 |

---

## 부록: API 엔드포인트 요약

### 인증

| Method | Path                | Auth | 설명               |
| ------ | ------------------- | ---- | ------------------ |
| GET    | `/api/auth/session` | ❌   | 현재 세션 조회     |
| POST   | `/api/auth/session` | ❌   | 로그인 (지갑 서명) |
| POST   | `/api/auth/logout`  | ❌   | 로그아웃           |

### 라운드

| Method | Path                             | Auth | 설명             |
| ------ | -------------------------------- | ---- | ---------------- |
| GET    | `/api/rounds`                    | ❌   | 라운드 목록      |
| GET    | `/api/rounds/current?type=6HOUR` | ❌   | 현재 활성 라운드 |
| GET    | `/api/rounds/[id]`               | ❌   | 라운드 상세      |

### 베팅

| Method | Path                | Auth | 설명         |
| ------ | ------------------- | ---- | ------------ |
| GET    | `/api/bets/public`  | ❌   | 공개 피드    |
| GET    | `/api/me/bets`      | ✅   | 내 베팅 목록 |
| GET    | `/api/bets/[id]`    | ❌   | 베팅 상세    |
| POST   | `/api/bets`         | ✅   | 베팅 Prepare |
| POST   | `/api/bets/execute` | ✅   | 베팅 Execute |

### Claim

| Method | Path                      | Auth | 설명          |
| ------ | ------------------------- | ---- | ------------- |
| POST   | `/api/bets/claim/prepare` | ✅   | Claim Prepare |
| POST   | `/api/bets/claim/execute` | ✅   | Claim Execute |

---

## 변경 이력

| 날짜       | 버전 | 변경 내용             |
| ---------- | ---- | --------------------- |
| 2025-12-15 | 1.0  | 초안 작성 (코드 기반) |
