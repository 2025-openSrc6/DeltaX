# DeltaX 마감 플랜 — 온체인 유지(DEL 포인트) + 투명 정산 노출

> **Last Updated**: 2025-12-15  
> **작성자**: 장태웅 (정산/라운드)

---

## 0. 목표/스코프(이번 마일스톤)

- **Goal**: "베팅/정산이 Sui 온체인에 기록되고 누구나 검증 가능"을 **실제로 보여주는 데모/프로덕트** 완성
- **In-scope**
  - 온체인: 베팅 풀 생성 → 베팅 → 락 → 정산(승자/배당률/수수료/가격) → 배당 전송(개별 Bet 소각 포함)
  - 오프체인: Cron이 위 온체인 함수를 호출 + 가격 입력 파이프(시가/종가) + `avgVol`(평소 변동성) 산출 + 출석 보상 민팅
  - 프론트: 라운드별 "온체인 정산 영수증(Settlement)" 뷰/링크/값 표시
- **Out-of-scope(이번엔 미룸)**
  - 온체인이 시계열(30일)을 직접 받아 `avgVol`을 계산하는 방식
  - 오라클 기반 가격/변동성 공급(완전 온체인)
  - 멀티시그/오라클

---

## 1. 현재 구현 상태 (2025-12-15 분석)

> 표기: ✅ 완료, ⚠️ 부분 구현, ❌ 미구현

### 1.1 온체인 (Sui Move)

| 항목                        | 상태 | 비고                                                                                           |
| --------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| 베팅/풀/정산/배당 Move 로직 | ✅   | `betting.move`: `create_pool`, `place_bet`, `lock_pool`, `finalize_round`, `distribute_payout` |
| e2e 테스트                  | ✅   | `betting_tests.move`                                                                           |
| 시간 단위 ms                | ✅   | `clock::timestamp_ms` 사용                                                                     |
| 승자 산식                   | ⚠️   | 현재: `abs(price_end - price_start)`. **정규화 강도로 교체 필요**                              |
| 상태머신                    | ⚠️   | 온체인: OPEN → LOCKED → SETTLED (취소/무효 없음)                                               |

### 1.2 오프체인 (Next.js / D1)

| 항목                                   | 상태 | 위치 / 비고                                                           |
| -------------------------------------- | ---- | --------------------------------------------------------------------- |
| 베팅 `place_bet` 플로우                | ✅   | `POST /api/bets` + `POST /api/bets/execute`                           |
| 라운드 크론 뼈대                       | ✅   | `app/api/cron/rounds/{create,open,lock,finalize,settle}/route.ts`     |
| **온체인 lock/finalize/payout 호출**   | ❌   | 현재 DB 기준만 처리, Sui 호출 없음                                    |
| RoundService 승자/배당 계산            | ⚠️   | 단순 % 비교. 정규화 강도 미적용                                       |
| 가격 스냅샷 API                        | ✅   | `GET /api/price/snapshot` (Binance 기반)                              |
| **크론에서 가격 API 호출**             | ❌   | 현재 mock 가격 사용 중 (hardcoded)                                    |
| `avgVol` 계산 라이브러리               | ✅   | `lib/services/normalizedStrength.ts`                                  |
| **정산에 avgVol 통합**                 | ❌   | 라이브러리 존재하나 정산에서 호출 안함                                |
| rounds 스키마 가격 컬럼                | ✅   | `goldStartPrice`, `goldEndPrice`, `btcStartPrice`, `btcEndPrice` 존재 |
| **rounds 스키마 avgVol 컬럼**          | ❌   | `paxgAvgVol`, `btcAvgVol` 컬럼 없음                                   |
| `priceSnapshot.service.ts`             | ❌   | 설계 문서에만 있고 미구현                                             |
| `fetchTickPrice` (경량 API)            | ❌   | 설계 문서에만 있고 미구현                                             |
| Sui 래퍼 (create/lock/finalize/payout) | ❌   | `place_bet`만 구현됨                                                  |
| `SUI_CAP_OBJECT_ID` 사용               | ❌   | env 정의됨, 코드에서 사용 안함                                        |
| 출석 보상 API/서비스                   | ❌   | 미구현                                                                |
| Settlement tx digest 저장              | ❌   | 베팅은 `bets.suiTxHash`, 라운드는 없음                                |

### 1.3 차트 데이터 수집 (현준 담당)

| 항목                          | 상태 | 비고                                              |
| ----------------------------- | ---- | ------------------------------------------------- |
| 차트 수집 API                 | ✅   | `POST /api/chart/collect`                         |
| 차트 API 경량화               | ❌   | 현재 `ticker/24hr` (무거움) → `ticker/price` 권장 |
| 파생지표 12개 계산            | ⚠️   | 전부 계산하지만 UI에서 사용 안함. 제거 권장       |
| `volatility_snapshots` 테이블 | ⚠️   | 저장만 하고 조회 없음. deprecated 권장            |
| OHLC fake candle              | ⚠️   | open=직전close로 만든 가짜. UI에서 close만 사용   |

---

## 2. 필수 작업 (태웅 담당)

### 2.1 rounds 스키마 마이그레이션

**파일**: `db/schema/rounds.ts`

```typescript
// 추가할 컬럼
paxgAvgVol: real('paxg_avg_vol'),
btcAvgVol: real('btc_avg_vol'),
priceSnapshotMeta: text('price_snapshot_meta'), // JSON: source, interval, timestamp
settlementTxHash: text('settlement_tx_hash'),
settlementObjectId: text('settlement_object_id'),
```

### 2.2 가격 스냅샷 서비스 구현

**파일**: `lib/rounds/priceSnapshot.service.ts` (신규)

```typescript
// 라운드 시작/종료 시 가격 스냅샷 캡처
export async function captureRoundPrice(asset: 'PAXG' | 'BTC'): Promise<{
  price: number;
  source: string;
  timestamp: Date;
}>;

// 정산용 avgVol 계산 (1h 캔들 30일 = 720개)
export async function calculateSettlementAvgVol(): Promise<{
  paxgAvgVol: number;
  btcAvgVol: number;
  meta: { interval: string; lookback: number; source: string; calculatedAt: string };
}>;

// 라운드 오픈 시 호출
export async function onRoundOpen(roundId: string): Promise<void>;

// 라운드 정산(finalize) 시 호출
export async function onRoundFinalize(roundId: string): Promise<{
  winner: 'PAXG' | 'BTC';
  paxgStrength: number;
  btcStrength: number;
}>;
```

### 2.3 Sui 래퍼 함수 구현

**파일**: `lib/sui/repository.ts` (신규)

```typescript
// 풀 생성
export async function createPool(
  roundId: string,
  lockTimeMs: number,
  endTimeMs: number,
): Promise<{ poolId: string; txDigest: string }>;

// 풀 잠금
export async function lockPool(poolId: string): Promise<{ txDigest: string }>;

// 라운드 정산
export async function finalizeRound(
  poolId: string,
  prices: { goldStart: number; goldEnd: number; btcStart: number; btcEnd: number },
  avgVols: { goldAvgVol: number; btcAvgVol: number },
  volMeta: object,
): Promise<{ settlementId: string; feeCoin: string; txDigest: string }>;

// 배당 지급
export async function distributePayout(
  poolId: string,
  settlementId: string,
  betObjectId: string,
): Promise<{ payoutCoin: string; txDigest: string }>;

// DEL 민팅 (출석 보상)
export async function mintDel(toAddress: string, amount: number): Promise<{ txDigest: string }>;
```

### 2.4 크론 연결

**수정 파일**:

- `app/api/cron/rounds/open/route.ts` → 가격 API 호출 + DB 저장
- `app/api/cron/rounds/lock/route.ts` → Sui `lockPool` 호출
- `app/api/cron/rounds/finalize/route.ts` → Sui `finalizeRound` 호출 + avgVol 계산
- `app/api/cron/rounds/settle/route.ts` → Sui `distributePayout` 호출

### 2.5 RoundService 승자 계산 변경

**파일**: `lib/rounds/service.ts`

```typescript
// Before: 단순 % 비교
const goldChange = ((goldEnd - goldStart) / goldStart) * 100;
const btcChange = ((btcEnd - btcStart) / btcStart) * 100;
const winner = goldChange > btcChange ? 'GOLD' : 'BTC';

// After: 정규화 강도 비교
const paxgReturn = ((paxgEnd - paxgStart) / paxgStart) * 100;
const btcReturn = ((btcEnd - btcStart) / btcStart) * 100;
const paxgStrength = paxgReturn / paxgAvgVol;
const btcStrength = btcReturn / btcAvgVol;
const winner = paxgStrength > btcStrength ? 'GOLD' : 'BTC';
```

---

## 3. 온체인 수정 (Move)

### 3.1 `finalize_round` 함수 수정

**파일**: `contracts/sources/betting.move`

**현재**:

```move
// abs(price_end - price_start) 기반 승자 판정
```

**변경**:

```move
// 정규화 강도 비교 (나눗셈 제거)
// abs(gΔ) * btc_start * btc_avg_vol >= abs(bΔ) * gold_start * gold_avg_vol → GOLD 승
```

**입력 추가**:

- `gold_avg_vol: u64` (스케일: avgVolPercent \* 10_000)
- `btc_avg_vol: u64` (스케일: avgVolPercent \* 10_000)

### 3.2 Settlement 구조 확장

```move
struct Settlement has key, store {
  id: UID,
  pool_id: ID,
  winner: u8,
  gold_start: u64,
  gold_end: u64,
  btc_start: u64,
  btc_end: u64,
  // 추가
  gold_avg_vol: u64,
  btc_avg_vol: u64,
  vol_window_days: u8,     // 30
  vol_sampling: vector<u8>, // "1h"
  vol_source: vector<u8>,   // "binance"
  settled_at: u64,
}
```

---

## 4. avgVol 스펙 (정산 규칙 - 변경 불가)

```typescript
const SETTLEMENT_AVGVOL_CONFIG = {
  interval: '1h', // 1시간 캔들
  lookback: 720, // 30일 (720개)
  method: 'returns_stddev', // 수익률(%)의 표준편차
  source: 'binance_klines',
  minDataPoints: 360, // 최소 15일 데이터 필요
  version: 'v1',
};
```

**예외 처리**:

- 데이터 부족 시 (< 360개): 라운드 VOID 처리 또는 기본값 사용
- avgVol = 0인 경우: 라운드 VOID 처리

---

## 5. 출석 보상 (DEL 민팅)

### 5.1 스키마

```typescript
// db/schema/attendanceRewards.ts (신규)
export const attendanceRewards = sqliteTable('attendance_rewards', {
  id: text('id').primaryKey(),
  walletAddress: text('wallet_address').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  amount: integer('amount').notNull(),
  txDigest: text('tx_digest'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
});
```

### 5.2 API

```typescript
// POST /api/rewards/attendance
// Body: { walletAddress: string }
// Response: { success: boolean, amount: number, txDigest: string }
```

---

## 6. 작업 일정 (2일)

### Day 1

- [ ] rounds 스키마 마이그레이션 (avgVol, settlementTxHash 등)
- [ ] `priceSnapshot.service.ts` 구현
- [ ] Sui 래퍼 `lib/sui/repository.ts` 뼈대
- [ ] 크론 open/finalize에서 가격 API 호출 연결

### Day 2

- [ ] Sui 래퍼 완성 (lock/finalize/payout)
- [ ] 크론에서 Sui 호출 연결
- [ ] RoundService 승자 계산 정규화 강도로 변경
- [ ] Settlement tx digest DB 저장
- [ ] (선택) 출석 보상 API

---

## 7. 테스트 체크리스트

### 서버 레벨

- [ ] 가격 스냅샷 캡처 정상 동작
- [ ] avgVol 계산 정확성 (기존 라이브러리와 일치)
- [ ] 크론 멱등성 (2번 호출해도 안전)
- [ ] Sui 트랜잭션 실패 시 재시도

### 온체인 레벨

- [ ] 정규화 강도 기반 승자 판정 테스트
- [ ] avgVol = 0 예외 처리
- [ ] Settlement 메타데이터 저장 확인

### 통합

- [ ] 라운드 1개 end-to-end (생성 → 오픈 → 락 → 정산 → 배당)
- [ ] Settlement 영수증 UI에서 조회

---

## 8. 차트팀 요청 사항

별도 문서 참조: [CHART_TEAM_REQUEST.md](./CHART_TEAM_REQUEST.md)

요약:

1. `fetchTickPrice` 함수 추가 (경량 API)
2. `collect/route.ts` 간소화 (파생지표 제거)
3. `volatility_snapshots` deprecated 처리

---

## 9. 관련 문서

- [CHART_AND_SETTLEMENT_FINAL_DESIGN.md](./CHART_AND_SETTLEMENT_FINAL_DESIGN.md)
- [CHART_TEAM_REQUEST.md](./CHART_TEAM_REQUEST.md)
- [BET_ONCHAIN_FLOW.md](./sui/BET_ONCHAIN_FLOW.md)
- [SUI_CONTRACT_SPEC.md](./sui/SUI_CONTRACT_SPEC.md)
