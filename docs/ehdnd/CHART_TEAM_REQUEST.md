# 차트팀(현준) 요청 함수 명세

> 작성일: 2025-12-15  
> 작성자: 장태웅 (정산/라운드 담당)  
> 목적: 정산 로직과 차트 도메인 분리를 위해 현준이에게 필요한 함수/변경 사항 요청

---

## 1. 배경 및 목적

현재 차트 수집 로직(`app/api/chart/collect/route.ts`)과 정산 로직이 분리되어야 합니다.

- **차트**: 5초 폴링으로 UX 제공 (close만 사용)
- **정산**: 라운드 시작/종료 시점 가격 스냅샷 + avgVol 계산

정산에 필요한 데이터 소스를 직접 가져올 수 있도록 몇 가지 함수가 필요합니다.

---

## 2. 요청 함수 목록

### 2.1 `fetchTickPrice` (신규)

**위치**: `lib/services/binance.ts`

**목적**: 5초 폴링용 경량 가격 조회 (기존 `ticker/24hr` → `ticker/price`)

```typescript
/**
 * 경량 tick 가격 조회 (5초 폴링용)
 *
 * @param asset - 'PAXG' | 'BTC'
 * @returns { price: number, timestamp: Date }
 *
 * @description
 * - 기존 fetchCurrentPrice는 ticker/24hr (무거움, 24h 통계 포함)
 * - 이 함수는 ticker/price (가격만, 경량)
 * - 5초 차트 수집에서 사용
 */
export async function fetchTickPrice(
  asset: 'PAXG' | 'BTC',
): Promise<{ price: number; timestamp: Date }>;
```

**Binance API**:

```
GET https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT
Response: { "symbol": "PAXGUSDT", "price": "2650.50" }
```

**비고**

- 기존 코드의 `fetchCurrentPrice`는 `ticker/24hr` (무거움) → 이 함수로 교체
- 정산(온체인 검증 목적)에는 tick 가격을 쓰지 않고 **klines close 기반**을 기본으로 함

---

### 2.2 `fetchKlinesWithMeta` (신규: 공통)

**위치**: `lib/services/binance.ts`

**목적**: 정산(온체인 입력)에서 필요한 1m/1h klines를 **메타데이터 포함**으로 가져오기

정산은 “재현 가능성/검증 가능성”이 핵심이라, **가격/avgVol 계산에 사용한 데이터 소스/윈도우를 온체인 Settlement에 같이 기록**해야 합니다.

```typescript
export type BinanceKline = {
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  numberOfTrades: number;
};

export type KlinesMeta = {
  exchange: 'binance';
  endpoint: '/api/v3/klines';
  symbol: string; // e.g. 'PAXGUSDT', 'BTCUSDT'
  asset: 'PAXG' | 'BTC';
  interval: '1m' | '1h';
  limit: number;

  // “이 가격은 어떤 캔들의 close인가?”를 온체인에서 검증할 수 있어야 함
  firstOpenTimeMs: number;
  lastCloseTimeMs: number;

  // 옵션: 구현 가능하면 포함 (없어도 됨)
  requestedAtMs?: number; // 서버가 Binance에 요청한 시간
};

/**
 * Binance klines 조회 + 온체인용 메타데이터 포함
 *
 * @param asset - 'PAXG' | 'BTC'
 * @param interval - '1m' | '1h'
 * @param limit - 예: 1m 스냅샷은 1, avgVol은 1h 720
 * @returns candles + meta (온체인에 기록할 필수 정보)
 */
export async function fetchKlinesWithMeta(
  asset: 'PAXG' | 'BTC',
  interval: '1m' | '1h',
  limit: number,
): Promise<{ candles: BinanceKline[]; meta: KlinesMeta }>;
```

**중요 (온체인에 넣어야 하는 메타데이터: 필수)**

- `exchange`, `endpoint`, `symbol`, `interval`, `limit`
- `firstOpenTimeMs`, `lastCloseTimeMs`

**설명**

- 정산 입력인 start/end 가격은 “특정 1m 캔들의 close”여야 재현 가능
- avgVol은 “1h 캔들 720개 범위(= 30일)”가 고정되어야 룰이 변하지 않음

---

### 2.3 `fetchRoundSnapshotKline1m` (신규: 라운드 오픈/종료)

**위치**: `lib/services/binance.ts`

**목적**: 라운드 오픈/종료 시점에 온체인에 넣을 start/end 가격을 **1m close 기준으로 캡처**

```typescript
/**
 * 라운드 가격 스냅샷용 1m kline 1개 조회
 *
 * @returns snapshot close + onchainMeta
 *
 * @note
 * - "tick"은 재현 불가하므로 정산 입력에는 사용하지 않음
 * - onchainMeta는 Settlement에 반드시 포함되어야 함
 */
export async function fetchRoundSnapshotKline1m(asset: 'PAXG' | 'BTC'): Promise<{
  close: number;
  closeTimeMs: number;
  onchainMeta: {
    exchange: 'binance';
    endpoint: '/api/v3/klines';
    symbol: string;
    interval: '1m';
    limit: 1;
    candleOpenTimeMs: number;
    candleCloseTimeMs: number;
  };
}>;
```

---

### 2.4 `fetchAvgVolKlines1h720` (신규: avgVol)

**위치**: `lib/services/binance.ts`

**목적**: avgVol 계산용 1h 캔들 720개(30일) 조회 + 온체인용 메타데이터 포함

> 이 함수는 **avgVol을 계산해서 리턴하는 함수가 아니라**,
> avgVol 계산에 필요한 **원천 데이터(720 close) + 온체인 검증용 fetch 메타데이터(조회 범위/심볼/인터벌)**를 제공하는 함수입니다.
> avgVol 계산은 Next 백엔드에서 `calculateAverageVolatility`로 수행합니다.

```typescript
/**
 * avgVol 계산용 1h klines 720개 조회
 *
 * @returns closes[] + onchainMeta
 */
export async function fetchAvgVolKlines1h720(asset: 'PAXG' | 'BTC'): Promise<{
  closes: number[];
  onchainMeta: {
    exchange: 'binance';
    endpoint: '/api/v3/klines';
    symbol: string;
    interval: '1h';
    limit: 720;
    firstOpenTimeMs: number;
    lastCloseTimeMs: number;
  };
}>;
```

**비고**

- “정산 룰 고정”을 위해 `avgVolDefinition/methodVersion/window` 같은 **계산 메타데이터**는 Settlement에 반드시 들어가야 함
- 다만 이 값들은 fetch 단계가 아니라 **계산 결과(avgVol)와 함께 패키징해서 반환**하는 편이 안전함 (아래 2.5 참고)

---

### 2.5 `calculateAvgVolForSettlement` (정산 도메인: 태웅 구현 / 참고용)

**위치**: `lib/rounds/priceSnapshot.service.ts` (또는 정산 전용 서비스)

**목적**: (2.4에서 받은) `closes[]`를 avgVol(%)로 계산하고, **온체인 Settlement에 넣을 메타데이터를 함께 구성**

레포에 이미 존재하는 계산 함수:

- `lib/services/normalizedStrength.ts`의 `calculateAverageVolatility`

```typescript
export async function calculateAvgVolForSettlement(input: {
  asset: 'PAXG' | 'BTC';
  closes: number[];
  klinesFetchMeta: {
    exchange: 'binance';
    endpoint: '/api/v3/klines';
    symbol: string;
    interval: '1h';
    limit: 720;
    firstOpenTimeMs: number;
    lastCloseTimeMs: number;
  };
}): Promise<{
  avgVolPercent: number;
  onchainMeta: {
    // fetch 메타(검증 가능성)
    exchange: 'binance';
    endpoint: '/api/v3/klines';
    symbol: string;
    interval: '1h';
    limit: 720;
    firstOpenTimeMs: number;
    lastCloseTimeMs: number;

    // 계산 메타(룰 고정)
    avgVolDefinition: 'returns_stddev_percent';
    window: { unit: 'candles'; count: 720 };
    methodVersion: 'v1';
  };
}>;
```

---

### 2.6 `collectChartData` 간소화 (기존 수정)

**위치**: `app/api/chart/collect/route.ts`

**목적**: 파생지표 12개 제거, close만 저장

**현재 문제점**:

1. `fetchCurrentPrice` → `ticker/24hr` 호출 (불필요하게 무거움)
2. 파생지표 12개 계산 (UI에서 안 씀)
3. `volatility_snapshots` 테이블에 저장 (조회처 없음)
4. fake OHLC 생성 (open=직전close)

**변경 요청**:

```typescript
// Before: 현재 코드
const { close, high, low, volume } = await fetchCurrentPrice(asset);
// + 파생지표 12개 계산
// + volatility_snapshots 저장

// After: 권장 코드
const { price, timestamp } = await fetchTickPrice(asset);
await db.insert(chartData).values({
  asset,
  timestamp,
  close: price,
  open: price, // 또는 생략
  high: price,
  low: price,
  volume: 0,
  // 파생지표 전부 null 또는 컬럼 제거
});
// volatility_snapshots 저장 제거
```

**제거 대상 계산 로직**:

- `calculateVolatilityChangeRate`
- `calculateVolatilityScore`
- `calculateMovementIntensity`
- `calculateTrendStrength`
- `calculateRelativePosition`
- `calculateRSI`
- `calculateATR`
- `calculateBollingerBands`
- `calculateMACD`
- `volatility_snapshots` insert

---

## 3. 스키마 정리 (선택, 나중)

### 3.1 `chart_data` 테이블

**유지할 컬럼**:

- `asset`, `timestamp`, `close`

**nullable로 두거나 제거 고려**:

- `open`, `high`, `low`, `volume` → nullable
- `volatility`, `averageVolatility` → nullable
- `volatilityChangeRate`, `volatilityScore` → nullable
- `movementIntensity`, `trendStrength`, `relativePosition` → nullable
- `rsi` → nullable

### 3.2 `volatility_snapshots` 테이블

**상태**: 저장만 하고 조회하는 코드 없음  
**권장**: deprecated 처리 또는 삭제

---

## 4. 정산 도메인과의 분리

### 중요 원칙

```
┌─────────────────────────────────────────────────────┐
│  차트 DB가 비어있거나 깨져도 정산은 영향 없어야 함   │
│                                                     │
│  정산 = Binance klines 직접 호출 (on-demand)        │
│  차트 = DB 캐시 (UX용, best-effort)                 │
└─────────────────────────────────────────────────────┘
```

### avgVol 정의 (정산 스펙 - 변경 불가)

```typescript
// lib/services/normalizedStrength.ts의 calculateAverageVolatility 사용
// 입력: 가격 시계열 (closes[])
// 처리: 인접 가격으로 수익률(%) 시퀀스 → 그 표준편차(stddev)
// 예: [100, 102, 101] → [2%, -0.98%] → stddev = 2.1%

const SETTLEMENT_AVGVOL_CONFIG = {
  interval: '1h', // 1시간 캔들
  lookback: 720, // 30일 (720개)
  method: 'returns_stddev', // 수익률의 표준편차
  source: 'binance_klines',
};
```

**참고**: `/api/chart/compare`의 volatility는 **price stddev** 기반 → 정산과 다른 지표임 (혼동 주의)

---

## 5. 우선순위

| 순위 | 항목                                     | 담당 | 비고                       |
| ---- | ---------------------------------------- | ---- | -------------------------- |
| 1    | `fetchKlinesWithMeta` 구현               | 현준 | 1m/1h 모두 커버, 메타 필수 |
| 2    | `fetchRoundSnapshotKline1m` 구현         | 현준 | 오픈/종료 가격 스냅샷용    |
| 3    | `fetchAvgVolKlines1h720` 구현            | 현준 | avgVol 입력 시계열용       |
| 4    | `fetchTickPrice` 함수 추가               | 현준 | 차트 수집(UX)용 경량 API   |
| 5    | `collect/route.ts` 간소화                | 현준 | 파생지표 제거              |
| 6    | 기존 차트 UI 동작 확인                   | 현준 | close만 써서 영향 없을 것  |
| 7    | (선택) `volatility_snapshots` deprecated | 현준 | 나중에                     |

---

## 6. 테스트 체크리스트

- [ ] `fetchKlinesWithMeta` 호출 시 candles+meta 정상 반환 (meta 필드 누락 없음)
- [ ] `fetchRoundSnapshotKline1m` 호출 시 close/closeTimeMs/onchainMeta 정상
- [ ] `fetchAvgVolKlines1h720` 호출 시 closes.length=720 + onchainMeta 정상
- [ ] `fetchTickPrice` 호출 시 가격 정상 반환
- [ ] `collect/route.ts` 간소화 후 5초 폴링 정상 동작
- [ ] 기존 차트 UI (BTCPriceChart, PAXGPriceChart 등) 정상 렌더링
- [ ] `/api/chart/normalized-strength` 정상 응답

---

## 7. 질문/협의 필요 사항

1. **fake OHLC 유지 여부**: 현재 open=직전close로 만드는데, 필요한가?
2. **volume 수집 필요 여부**: 현재 ticker/24hr에서 가져오는데 UI에서 쓰는지?
3. **volatility_snapshots 삭제 일정**: 바로 삭제? deprecated 후 나중에?

---

_문의: 장태웅 (정산/라운드)_
