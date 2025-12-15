# DeltaX 마감 플랜 — 온체인 유지(DEL 포인트) + 투명 정산 노출

> **Last Updated**: 2025-12-15  
> **작성자**: 장태웅 (정산/라운드)

---

## 0. 목표/스코프(이번 마일스톤)

- **Goal**: "베팅/정산이 Sui 온체인에 기록되고 누구나 검증 가능"을 **실제로 보여주는 데모/프로덕트** 완성
- **In-scope**
  - 온체인: 베팅 풀 생성 → 베팅 → 락 → 정산(승자/배당률/수수료/가격/avgVol, Settlement 영수증) → **유저 Claim 기반 배당(개별 Bet 소각 포함)**
  - 오프체인: Cron이 위 온체인 함수를 호출 + 가격 입력 파이프(시가/종가) + `avgVol`(평소 변동성) 산출 + (선택) 출석 보상 민팅
  - 프론트: 라운드별 "온체인 정산 영수증(Settlement)" 뷰/링크/값 표시
- **Out-of-scope(이번엔 미룸)**
  - 온체인이 시계열(30일)을 직접 받아 `avgVol`을 계산하는 방식
  - 오라클 기반 가격/변동성 공급(완전 온체인)
  - 멀티시그/오라클

---

## 1. 현재 구현 상태 (2025-12-15 분석 / Claim 구현 반영)

> 표기: ✅ 완료, ⚠️ 부분 구현, ❌ 미구현

### 1.1 온체인 (Sui Move)

| 항목                        | 상태 | 비고                                                                                           |
| --------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| 베팅/풀/정산/배당 Move 로직 | ✅   | `betting.move`: `create_pool`, `place_bet`, `lock_pool`, `finalize_round`, `distribute_payout` |
| e2e 테스트                  | ✅   | `betting_tests.move`                                                                           |
| 시간 단위 ms                | ✅   | `clock::timestamp_ms` 사용                                                                     |
| 승자 산식                   | ✅   | `return/avgVol` 기반 정규화 강도 비교(나눗셈 없이 cross-multiply)                              |
| 상태머신                    | ⚠️   | 온체인: OPEN → LOCKED → SETTLED (취소/무효 없음)                                               |

### 1.2 오프체인 (Next.js / D1)

| 항목                                   | 상태 | 위치 / 비고                                                                      |
| -------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| 베팅 `place_bet` 플로우                | ✅   | `POST /api/bets` + `POST /api/bets/execute`                                      |
| 베팅 조회(홈 공개 피드)                | ✅   | `GET /api/bets/public` (주소 마스킹 + on-chain 검증 키 노출)                     |
| 베팅 조회(내 베팅)                     | ✅   | `GET /api/me/bets` (인증 필수, userId는 세션에서 결정)                           |
| 라운드 크론 뼈대                       | ✅   | `app/api/cron/rounds/{create,open,lock,finalize}/route.ts` (settle는 Job5 폐기)  |
| **온체인 lock/finalize 호출**          | ✅   | `RoundService.openRound/lockRound/finalizeRound` → `lib/sui/admin.ts`            |
| **payout(배당) 호출**                  | ✅   | Job5 폐기. 유저 Claim(prepare/execute + `claim_payout`)로 전환 완료(서버 경유)   |
| RoundService 승자 판정                 | ✅   | on-chain과 동일한 정규화 강도 비교(cross-multiply)로 계산                        |
| 가격 스냅샷 API                        | ✅   | `GET /api/price/snapshot` (Binance 기반)                                         |
| **크론에서 가격 API 호출**             | ❌   | `app/api/cron/rounds/open`, `finalize`가 아직 mock 가격 사용 (머지 후 교체 필요) |
| `avgVol` 계산 라이브러리               | ✅   | `lib/services/normalizedStrength.ts`                                             |
| **정산에 avgVol 통합**                 | ✅   | `lib/rounds/avgVol.service.ts` + Job4에서 on-chain `finalize_round`에 주입       |
| rounds 스키마 가격 컬럼                | ✅   | `goldStartPrice`, `goldEndPrice`, `btcStartPrice`, `btcEndPrice` 존재            |
| **rounds 스키마 avgVol/영수증 컬럼**   | ✅   | `goldAvgVol`, `btcAvgVol`, `avgVolMeta`, `priceSnapshotMeta`, `sui*` 필드 존재   |
| `priceSnapshot.service.ts`             | ❌   | 설계 문서에만 있고 미구현                                                        |
| `fetchTickPrice` (경량 API)            | ❌   | 설계 문서에만 있고 미구현                                                        |
| Sui 래퍼 (create/lock/finalize/payout) | ✅   | `lib/sui/admin.ts` 구현 완료(주의: payout은 유저 claim 모델 권장)                |
| `SUI_CAP_OBJECT_ID` 사용               | ✅   | `SUI_ADMIN_CAP_ID` 우선, 없으면 `SUI_CAP_OBJECT_ID` fallback 처리                |
| 출석 보상 API/서비스                   | ❌   | 미구현                                                                           |
| Settlement tx digest/영수증 저장       | ✅   | Job4에서 `suiFinalizeTxDigest/suiSettlementObjectId/suiFeeCoinObjectId` 저장     |
| bet/claim recovery API                 | ✅   | `POST /api/bets/recover`, `POST /api/bets/claim/recover` (cron/auth 전용)        |
| Job6(Recovery)                         | ⚠️   | 라운드 recovery 골격 보완 필요(라운드 stuck 케이스/알림/백필 범위 확정)          |

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
// (완료) 이미 반영된 핵심 컬럼들
goldAvgVol: real('gold_avg_vol'),
btcAvgVol: real('btc_avg_vol'),
avgVolMeta: text('avg_vol_meta'),
priceSnapshotMeta: text('price_snapshot_meta'),
suiFinalizeTxDigest: text('sui_finalize_tx_digest'),
suiSettlementObjectId: text('sui_settlement_object_id'),
suiFeeCoinObjectId: text('sui_fee_coin_object_id'),
```

### 2.2 가격 스냅샷 서비스 구현 (완료)

- **파일**: `lib/rounds/priceSnapshot.service.ts`
- **기능**: `fetchStartPriceSnapshot` / `fetchEndPriceSnapshot` → Binance 1m kline close(PAXG/BTC) 두 개를 조회해 `PriceData` 구성.
  - `source: 'binance_klines_1m'`
  - `meta: { kind: 'start' | 'end', paxg: onchainMeta, btc: onchainMeta }` (캔들 범위/심볼/인터벌 포함)
- **사용처**: Job2/Job4 route에서 호출 → RoundService로 전달(FSM/Sui-first는 동일).

### 2.3 Sui 래퍼 함수 구현

**상태**: (불필요/보류) `lib/sui/admin.ts`를 Cron/Service에서 직접 사용 중.

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

- `app/api/cron/rounds/open/route.ts` → (남음) 가격 API 호출 + DB 저장 (현재 mock)
- `app/api/cron/rounds/lock/route.ts` → ✅ Sui `lockPool` 호출
- `app/api/cron/rounds/finalize/route.ts` → ✅ Sui `finalizeRound` 호출 + avgVol 계산 + SETTLED/VOIDED 전이
- `app/api/cron/rounds/settle/route.ts` → ❌ Job5 폐기(410 deprecated). Claim 모델로 대체

### 2.5 RoundService 승자 계산 변경

**파일**: `lib/rounds/service.ts`

```typescript
// Before: 단순 % 비교
const goldChange = ((goldEnd - goldStart) / goldStart) * 100;
const btcChange = ((btcEnd - btcStart) / btcStart) * 100;
const winner = goldChange > btcChange ? 'GOLD' : 'BTC';

// After: 정규화 강도 비교
// on-chain과 동일한 cross-multiply 비교로 winner 산출 (동점 시 GOLD)
// abs(gReturn) * btcAvgVol >= abs(bReturn) * goldAvgVol → GOLD 승
```

### 2.6 Claim(prepare/execute) API 구현 (다음 스코프)

- 상태: ✅ 구현 완료 (서버 경유 claim만 허용)
- 목표: `rounds.status in (SETTLED, VOIDED)` + `rounds.suiSettlementObjectId` + `bets.suiBetObjectId` 기반으로
  유저가 `claim_payout`을 호출할 수 있는 sponsored tx 흐름 제공.
- 구현:
  - `POST /api/bets/claim/prepare` (txBytes + nonce)
  - `POST /api/bets/claim/execute` (userSig + sponsor execute → txDigest + payoutAmount 저장)
  - A안: betObjectId는 `POST /api/bets/execute`에서 objectChanges 파싱으로 `bets.suiBetObjectId`에 저장

### 2.7 다음 작업 (보안/운영)

- [x] `/api/bets/execute`에서 `userId`를 body로 받지 않도록 인증 흐름 일괄화(쿠키 `suiAddress` → userId)
- [x] bet/claim recovery API 추가 (체인 성공, DB 실패 보정) — `POST /api/bets/recover`, `POST /api/bets/claim/recover`
- [ ] Settlement 영수증 UI/조회 연결 (round별 settlementId 링크/표시)
- [x] (현준 PR 머지 후) Job2/Job4 가격 스냅샷 교체: `CHART_TEAM_REQUEST.md`의 1m kline close 기반으로 start/end 가격 + 메타 저장
- [x] (현준 PR 머지 후) avgVol 입력 메타 강화: 1h 720 klines fetch meta를 `avgVolMeta`에 포함(룰 고정/검증 가능성)

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

- [x] rounds 스키마 마이그레이션 (avgVol, priceSnapshotMeta, sui 영수증 필드)
- [x] Job 2/3 Sui-first 연결 (create_pool / lock_pool)
- [x] Job 4 Sui-first 연결 (finalize_round + 영수증 저장 + SETTLED/VOIDED 전이)
- [ ] 크론 open/finalize에서 실제 가격 API 호출 연결(현재 mock)

### Day 2

- [ ] Claim(prepare/execute) API 구현 (유저 claim 모델)
- [ ] Settlement 영수증 UI(조회/링크) 연결
- [ ] (선택) 출석 보상 API

---

## 7. 테스트 체크리스트

### 서버 레벨

- [ ] 크론 가격 소스 실연동(현준 API) 정상 동작
- [ ] avgVol 계산(1h, 30d, returns stddev) 정상 동작 + 데이터 부족 시 VOID 처리
- [ ] 크론 멱등성 (open/lock/finalize를 2번 호출해도 안전)
- [ ] Claim prepare/execute 멱등성/만료/nonce 단일소비

### 온체인 레벨

- [ ] 정규화 강도 기반 승자 판정 테스트
- [ ] avgVol = 0 예외 처리
- [ ] Settlement 메타데이터 저장 확인

### 통합

- [ ] 라운드 1개 end-to-end (생성 → 오픈 → 락 → 정산(Settlement) → 유저 Claim)
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
