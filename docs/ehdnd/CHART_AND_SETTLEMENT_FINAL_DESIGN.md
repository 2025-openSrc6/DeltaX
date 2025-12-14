# Chart & Settlement 최종 설계 (DeltaX)

> 작성일: 2024-12-14  
> 수정일: 2025-12-15  
> 작성자: 장태웅 (정산/라운드), Copilot 검토

---

## 0. 구현 현황 (2025-12-15 업데이트)

### 구현 완료 ✅

| 항목                    | 위치                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| rounds 스키마 가격 컬럼 | `db/schema/rounds.ts` - `goldStartPrice`, `goldEndPrice`, `btcStartPrice`, `btcEndPrice` |
| 가격 스냅샷 API         | `GET /api/price/snapshot`                                                                |
| avgVol 계산 라이브러리  | `lib/services/normalizedStrength.ts` - `calculateAverageVolatility`                      |
| fetchKlines 함수        | `lib/services/binance.ts` (구현됨, 정산에서 사용 예정)                                   |

### 미구현 ❌

| 항목                       | 필요 작업                           |
| -------------------------- | ----------------------------------- |
| rounds 스키마 avgVol 컬럼  | `paxgAvgVol`, `btcAvgVol` 추가 필요 |
| `priceSnapshot.service.ts` | 신규 구현 필요                      |
| `fetchTickPrice` 함수      | 신규 구현 필요 (차트팀)             |
| 크론에서 가격 API 호출     | 현재 mock 가격 사용 중              |
| 정산 승자 계산 변경        | 단순 % → 정규화 강도                |

---

## 1. 현재 상태 분석 요약

### 문제점

| 항목                   | 현재                    | 문제                                                           |
| ---------------------- | ----------------------- | -------------------------------------------------------------- |
| 실시간 가격 API        | `ticker/24hr` (무거움)  | 5초 폴링에 불필요한 24h 통계까지 받아옴                        |
| OHLCV 저장             | 임의 계산 (fake candle) | open=직전close, high/low=max/min으로 만든 가짜. 캔들 의미 없음 |
| 파생지표 저장          | 12개 컬럼 계산+저장     | **단 하나도 UI에서 사용 안 함**                                |
| `volatility_snapshots` | 저장만                  | 조회하는 코드 없음                                             |
| 정산용 데이터          | 없음                    | start/end price, avgVol 저장 구조 없음                         |
| `fetchKlines`          | 구현되어 있음           | **사용처 0개** (죽은 코드)                                     |

### 차트 UI가 실제로 사용하는 것

```
✅ chart_data.close      → 모든 차트가 이것만 씀
✅ chart_data.timestamp  → 시간축
❌ open/high/low/volume  → 받기만 하고 안 씀
❌ volatility 등 파생지표 → 프론트가 close[]로 재계산
```

---

## 2. 최종 설계

### 2.1 데이터 파이프라인 분리

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA SOURCE: Binance REST                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │ /ticker/price│   │ /klines (1m) │   │ /klines (1h) │        │
│  │  lastPrice   │   │   OHLCV      │   │   OHLCV      │        │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
│         │                  │                  │                 │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  5초 차트 UX    │  │  라운드 시작/종료 │  │   정산 avgVol   │
│  (실시간 느낌)   │  │   price 스냅샷   │  │   계산/저장     │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ • Redis latest  │  │ • 1m close 사용 │  │ • 1h × 720개   │
│   또는 DB 캐시  │  │ • rounds 테이블 │  │ • returns stddev│
│ • 짧은 retention│  │   에 저장       │  │ • 온체인 기록   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 2.2 역할 분리

| 용도                 | 데이터 소스           | 저장 위치             | 담당   |
| -------------------- | --------------------- | --------------------- | ------ |
| **5초 차트 UX**      | `ticker/price` (tick) | Redis or DB 캐시      | 차트팀 |
| **라운드 start/end** | `klines 1m` (close)   | `rounds` 테이블       | 태웅   |
| **정산 avgVol**      | `klines 1h × 720`     | `rounds` 테이블 + Sui | 태웅   |

---

## 3. 구체적 변경 사항

### 3.1 Binance API 변경 (경량화)

**현재**: `ticker/24hr` (무거움, 24h 통계 포함)

```typescript
// 현재 - 불필요하게 무거움
const url = `${BINANCE_BASE_URL}/ticker/24hr?symbol=${symbol}`;
```

**변경**: `ticker/price` (가격만)

```typescript
// 권장 - 가격만 가볍게
const url = `${BINANCE_BASE_URL}/ticker/price?symbol=${symbol}`;
// 응답: { "symbol": "BTCUSDT", "price": "99000.00" }
```

**추가 함수** (binance.ts):

```typescript
// 경량 tick 가격 조회 (5초 폴링용)
export async function fetchTickPrice(
  asset: SupportedAsset,
): Promise<{ price: number; timestamp: Date }> {
  await rateLimitTracker.checkAndWait();

  const symbol = SYMBOL_MAP[asset];
  const url = `${BINANCE_BASE_URL}/ticker/price?symbol=${symbol}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance API error: ${response.status}`);

  const data = await response.json();
  return {
    price: parseFloat(data.price),
    timestamp: new Date(),
  };
}
```

### 3.2 차트 수집 간소화 (collect)

**현재**: 12개 파생지표 계산 + fake OHLC + volatility_snapshots
**변경**: `close` + `timestamp`만 저장

```typescript
// app/api/chart/collect/route.ts 간소화
export async function POST() {
  for (const asset of TARGET_ASSETS) {
    const { price, timestamp } = await fetchTickPrice(asset);

    // 중복 체크 (1초 이내)
    const existing = await db.select()...
    if (existing.length > 0) continue;

    // 최소 저장 (close만 의미있음)
    await db.insert(chartData).values({
      asset,
      timestamp,
      close: price,
      // OHLC는 차트에서 안 쓰므로 생략 가능 (또는 모두 price로)
      open: price,
      high: price,
      low: price,
      volume: 0,
      // 파생지표: 전부 제거 또는 null
    });
  }
}
```

### 3.3 라운드 스키마 추가 (정산용)

> **2025-12-15 현황**: 가격 컬럼은 이미 존재 (`goldStartPrice`, `goldEndPrice`, `btcStartPrice`, `btcEndPrice`). avgVol 컬럼만 추가 필요.

**rounds 테이블에 추가할 컬럼**:

```typescript
// db/schema/rounds.ts - 추가 필요한 컬럼만
export const rounds = sqliteTable('rounds', {
  // ... 기존 컬럼 (가격은 이미 있음) ...

  // avgVol (정산용) - 추가 필요 ❌
  paxgAvgVol: real('paxg_avg_vol'),
  btcAvgVol: real('btc_avg_vol'),

  // 메타데이터 (감사추적) - 추가 필요 ❌
  priceSnapshotMeta: text('price_snapshot_meta'), // JSON: source, interval, timestamp
  settlementTxHash: text('settlement_tx_hash'), // Sui tx digest
  settlementObjectId: text('settlement_object_id'), // Sui Settlement object id
});
```

### 3.4 정산 서비스 함수 (새로 추가)

```typescript
// lib/rounds/priceSnapshot.service.ts

import { fetchKlines, fetchTickPrice } from '@/lib/services/binance';
import { calculateAverageVolatility } from '@/lib/services/normalizedStrength';

/**
 * 라운드 시작/종료 시 가격 스냅샷 캡처
 * - 1m 캔들의 close를 기준으로 함 (재현 가능)
 */
export async function captureRoundPrice(asset: 'PAXG' | 'BTC'): Promise<{
  price: number;
  source: string;
  timestamp: Date;
}> {
  // 옵션 A: 최신 1m 캔들의 close (권장 - 재현 가능)
  const klines = await fetchKlines(asset, '1m', 1);
  const latestCandle = klines[0];

  return {
    price: latestCandle.close,
    source: 'binance_klines_1m',
    timestamp: new Date(latestCandle.closeTime),
  };

  // 옵션 B: tick 가격 (실시간성 우선, 재현 어려움)
  // const tick = await fetchTickPrice(asset);
  // return { price: tick.price, source: 'binance_ticker', timestamp: tick.timestamp };
}

/**
 * 정산용 avgVol 계산 (1h 캔들 30일 = 720개)
 */
export async function calculateSettlementAvgVol(): Promise<{
  paxgAvgVol: number;
  btcAvgVol: number;
  meta: {
    interval: string;
    lookback: number;
    source: string;
    calculatedAt: string;
  };
}> {
  const [paxgKlines, btcKlines] = await Promise.all([
    fetchKlines('PAXG', '1h', 720),
    fetchKlines('BTC', '1h', 720),
  ]);

  const paxgAvgVol = calculateAverageVolatility(
    paxgKlines.map((k) => k.close),
    30,
  );
  const btcAvgVol = calculateAverageVolatility(
    btcKlines.map((k) => k.close),
    30,
  );

  return {
    paxgAvgVol,
    btcAvgVol,
    meta: {
      interval: '1h',
      lookback: 720,
      source: 'binance_klines',
      calculatedAt: new Date().toISOString(),
    },
  };
}

/**
 * 라운드 오픈 시 호출
 */
export async function onRoundOpen(roundId: string) {
  const [paxg, btc] = await Promise.all([captureRoundPrice('PAXG'), captureRoundPrice('BTC')]);

  await db
    .update(rounds)
    .set({
      paxgStartPrice: paxg.price,
      btcStartPrice: btc.price,
      priceSnapshotMeta: JSON.stringify({
        startPaxg: paxg,
        startBtc: btc,
      }),
    })
    .where(eq(rounds.id, roundId));
}

/**
 * 라운드 정산(finalize) 시 호출
 */
export async function onRoundFinalize(roundId: string) {
  // 1. 종료 가격 캡처
  const [paxg, btc] = await Promise.all([captureRoundPrice('PAXG'), captureRoundPrice('BTC')]);

  // 2. avgVol 계산
  const avgVolResult = await calculateSettlementAvgVol();

  // 3. DB 업데이트
  await db
    .update(rounds)
    .set({
      paxgEndPrice: paxg.price,
      btcEndPrice: btc.price,
      paxgAvgVol: avgVolResult.paxgAvgVol,
      btcAvgVol: avgVolResult.btcAvgVol,
      priceSnapshotMeta: JSON.stringify({
        // 기존 start 정보 유지하면서 추가
        endPaxg: paxg,
        endBtc: btc,
        avgVol: avgVolResult.meta,
      }),
    })
    .where(eq(rounds.id, roundId));

  // 4. 승자 계산 (정규화 강도 기반)
  const round = await db.select().from(rounds).where(eq(rounds.id, roundId)).get();

  const paxgReturn = ((round.paxgEndPrice - round.paxgStartPrice) / round.paxgStartPrice) * 100;
  const btcReturn = ((round.btcEndPrice - round.btcStartPrice) / round.btcStartPrice) * 100;

  const paxgStrength = paxgReturn / avgVolResult.paxgAvgVol;
  const btcStrength = btcReturn / avgVolResult.btcAvgVol;

  const winner = paxgStrength > btcStrength ? 'PAXG' : 'BTC';

  // 5. Sui 온체인 기록 (메타데이터 포함)
  // await suiService.settleRound(roundId, winner, { ... });

  return { winner, paxgStrength, btcStrength };
}
```

---

## 4. 제거/정리 대상

### 4.1 즉시 제거 가능

| 항목                                                         | 위치               | 이유         |
| ------------------------------------------------------------ | ------------------ | ------------ |
| `volatility_snapshots` insert                                | `collect/route.ts` | 조회처 없음  |
| 파생지표 계산 로직                                           | `collect/route.ts` | UI에서 안 씀 |
| - `calculateVolatilityChangeRate`                            |                    |              |
| - `calculateVolatilityScore`                                 |                    |              |
| - `calculateMovementIntensity`                               |                    |              |
| - `calculateTrendStrength`                                   |                    |              |
| - `calculateRelativePosition`                                |                    |              |
| - `calculateRSI`                                             |                    |              |
| - `calculateATR`, `calculateBollingerBands`, `calculateMACD` |                    |              |

### 4.2 스키마 정리 (선택)

```typescript
// chart_data에서 nullable로 두거나 제거 고려
// - volatility, averageVolatility
// - volatilityChangeRate, volatilityScore
// - movementIntensity, trendStrength, relativePosition
// - rsi

// volatility_snapshots 테이블
// - deprecated 처리 또는 삭제
```

### 4.3 사용되지 않는 컴포넌트/훅 (차트팀 확인 후)

| 항목                       | 사용처                       |
| -------------------------- | ---------------------------- |
| `useVolatility` 훅         | `VolatilityChart`에서만 사용 |
| `VolatilityChart` 컴포넌트 | 앱에서 사용처 없음           |

---

## 5. 마이그레이션 순서 (2025-12-15 업데이트)

### Phase 1: 정산 인프라 (태웅 - 우선)

1. ✅ `rounds` 스키마에 가격 컬럼 추가 (완료: `goldStartPrice`, `goldEndPrice`, `btcStartPrice`, `btcEndPrice`)
2. ❌ `rounds` 스키마에 avgVol 컬럼 추가 (`paxgAvgVol`, `btcAvgVol`) - **필요**
3. ❌ `priceSnapshot.service.ts` 구현 - **필요**
4. ❌ 라운드 open/finalize 크론에서 가격 API 호출 연결 (현재 mock 사용 중)
5. ❌ Sui 온체인 정산 로직에 통합 - **필요**

### Phase 2: 차트 경량화 (차트팀)

1. ❌ `fetchTickPrice` 함수 추가 (binance.ts)
2. ❌ `collect/route.ts` 간소화 (파생지표 제거)
3. ❌ `fetchCurrentPrice`를 `fetchTickPrice`로 교체
4. 테스트 후 배포

### Phase 3: 정리 (나중)

1. `volatility_snapshots` 테이블 deprecated
2. 사용 안 하는 스키마 컬럼 정리
3. 죽은 코드 제거

---

## 6. 베스트 프랙티스 & 조언

### 6.1 가격 소스 일관성

```
⚠️ 중요: 정산에 사용하는 가격은 반드시 "재현 가능"해야 함

✅ 1m/1h klines close  → 특정 시점의 캔들 close는 불변
❌ ticker lastPrice    → 호출 시점마다 다름, 재현 불가
```

### 6.2 avgVol 계산 정의 고정

```typescript
// 정산 계약 (변경 시 공지 필요)
const SETTLEMENT_AVGVOL_CONFIG = {
  interval: '1h', // 1시간 캔들
  lookback: 720, // 30일 (720개)
  method: 'returns_stddev', // 수익률의 표준편차
  source: 'binance_klines',
};
```

### 6.3 차트 DB vs 정산 독립성

```
┌─────────────────────────────────────────────────────┐
│  차트 DB가 비어있거나 깨져도 정산은 영향 없어야 함   │
│                                                     │
│  정산 = Binance klines 직접 호출 (on-demand)        │
│  차트 = DB 캐시 (UX용, best-effort)                 │
└─────────────────────────────────────────────────────┘
```

### 6.4 Sui 온체인 기록 시 메타데이터

```typescript
// 온체인에 기록할 때 재현 가능한 정보 포함
const onchainMeta = {
  paxgStartPrice: 2650.5,
  paxgEndPrice: 2655.2,
  btcStartPrice: 99000,
  btcEndPrice: 98500,
  paxgAvgVol: 0.42,
  btcAvgVol: 3.15,
  winner: 'PAXG',
  // 검증용 메타
  priceSource: 'binance_klines_1m',
  avgVolSource: 'binance_klines_1h_720',
  settledAt: '2024-12-14T12:00:00Z',
};
```

### 6.5 Redis 활용 (선택)

```
5초 UX가 DB 부하를 주면:

1. Redis에 latest price만 저장 (TTL 60초)
2. 프론트는 Redis 기반 API 폴링
3. DB에는 1분마다만 저장 (히스토리용)
```

---

## 7. 최종 체크리스트 (2025-12-15 업데이트)

### 정산 (태웅)

- [x] `rounds` 스키마에 가격 컬럼 존재 확인
- [ ] `rounds` 스키마 마이그레이션 생성 (avgVol 컬럼)
- [ ] `priceSnapshot.service.ts` 구현
- [ ] `onRoundOpen` / `onRoundFinalize` 연결
- [ ] Sui 래퍼 함수 구현 (`lib/sui/repository.ts`)
- [ ] Sui 온체인 정산 로직 통합
- [ ] 테스트: avgVol 계산 검증
- [ ] 테스트: 가격 스냅샷 저장 검증

### 차트 (현준)

- [ ] `fetchTickPrice` 함수 추가
- [ ] `collect/route.ts`에서 파생지표 제거
- [ ] `fetchCurrentPrice` → `fetchTickPrice` 교체
- [ ] 기존 차트 UI 동작 확인
- [ ] (선택) Redis 최신가 캐시 도입

### 정리 (나중)

- [ ] `volatility_snapshots` deprecated 처리
- [ ] 미사용 스키마 컬럼 정리
- [ ] 미사용 컴포넌트/훅 제거

---

## 8. 관련 문서

- [TODO_UPDATED.md](./sui/TODO_UPDATED.md) - 전체 TODO 및 작업 일정
- [CHART_TEAM_REQUEST.md](./CHART_TEAM_REQUEST.md) - 차트팀 요청 함수 명세

---

## 9. 요약

```
Before:
- 5초마다 무거운 API로 fake OHLC + 파생지표 12개 계산 → 아무도 안 씀
- 정산용 가격/avgVol 저장 구조 없음
- fetchKlines 있는데 사용 안 함

After:
- 5초 차트: ticker/price로 close만 저장 (경량)
- 라운드 open: klines 1m close로 startPrice 저장
- 라운드 finalize: klines 1m close로 endPrice + klines 1h 720개로 avgVol 계산
- Sui: 모든 정산 데이터 온체인 기록 (재현 가능)
```
