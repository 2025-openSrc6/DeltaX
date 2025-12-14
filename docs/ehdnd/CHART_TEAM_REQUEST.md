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

**기존 코드 참고**: `fetchCurrentPrice` (L165-217)와 유사하지만 endpoint만 변경

---

### 2.2 `getKlinesForSettlement` (신규 또는 기존 활용)

**위치**: `lib/services/binance.ts` 또는 `lib/rounds/priceSnapshot.service.ts`

**목적**: 정산용 avgVol 계산을 위한 1시간 캔들 720개 (30일) 조회

```typescript
/**
 * 정산용 klines 조회 (avgVol 계산용)
 *
 * @param asset - 'PAXG' | 'BTC'
 * @returns 1시간 캔들 720개의 close 배열
 *
 * @description
 * - 정산 시점에 호출
 * - avgVol = 수익률(%) 시퀀스의 표준편차
 * - 기존 fetchKlines 함수가 있으나 사용처 없음 → 이걸 활용하면 됨
 */
export async function getKlinesForSettlement(
  asset: 'PAXG' | 'BTC',
): Promise<{ closes: number[]; meta: { interval: string; count: number; source: string } }>;
```

**참고**: 기존 `fetchKlines` 함수 (L125-163) 있음. 그대로 사용 가능.

---

### 2.3 `collectChartData` 간소화 (기존 수정)

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

| 순위 | 항목                                     | 담당 | 비고                      |
| ---- | ---------------------------------------- | ---- | ------------------------- |
| 1    | `fetchTickPrice` 함수 추가               | 현준 | 경량 API로 교체           |
| 2    | `collect/route.ts` 간소화                | 현준 | 파생지표 제거             |
| 3    | 기존 차트 UI 동작 확인                   | 현준 | close만 써서 영향 없을 것 |
| 4    | (선택) `volatility_snapshots` deprecated | 현준 | 나중에                    |

---

## 6. 테스트 체크리스트

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
