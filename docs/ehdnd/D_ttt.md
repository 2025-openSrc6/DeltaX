## 📊 chart-demo 차트별 데이터 흐름 분석

### 1. PAXGPriceChart / BTCPriceChart

```
useChartData → GET /api/chart/historical → DB: chart_data
```

| DB에서 읽는 컬럼 | 프론트에서 사용         |
| ---------------- | ----------------------- |
| `timestamp`      | ✅ 시간축               |
| `close`          | ✅ **라인 차트 그리기** |
| `open/high/low`  | ❌ 받기만 하고 안 씀    |
| `volume`         | ❌ 받기만 하고 안 씀    |
| `volatility`     | ❌ 받기만 하고 안 씀    |

**결론**: `close` + `timestamp`만 필요

---

### 2. VolatilityCandlestickChart

```
useChartData → GET /api/chart/historical → DB: chart_data
```

| DB에서 읽는 컬럼 | 프론트에서 사용                        |
| ---------------- | -------------------------------------- |
| `timestamp`      | ✅ 시간축                              |
| `close`          | ✅ **프론트에서 volatility 직접 계산** |
| `open/high/low`  | ❌ 안 씀                               |

**프론트 계산 로직** (VolatilityCandlestickChart.tsx):

```typescript
// close 배열로 프론트에서 직접 계산
const calculateVolatility = (prices: number[], windowSize = 10) => {
  const mean = window.reduce((sum, p) => sum + p, 0) / window.length;
  const variance = window.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / window.length;
  return Math.sqrt(variance);
};
```

**결론**: `close` + `timestamp`만 필요 (DB의 `volatility` 컬럼 안 씀)

---

### 3. NormalizedStrengthChart

```
직접 fetch → GET /api/chart/normalized-strength → DB: chart_data
```

**API가 DB에서 읽는 것**:
| 쿼리 | 읽는 컬럼 |
|------|----------|
| period 구간 PAXG/BTC | `close`, `timestamp` |
| 과거 30일 PAXG/BTC (limit 720) | `close` |

**API에서 계산 (서버)**:

```typescript
// 시작가 대비 수익률
const paxgReturn = ((close - startPrice) / startPrice) * 100;

// avgVol = 수익률 표준편차
const paxgAvgVol = calculateAverageVolatility(closes, 30);

// 정규화 강도 = 수익률 / avgVol
const paxgStrength = paxgReturn / paxgAvgVol;
```

**프론트에서 사용**: `paxgStrength`, `btcStrength`, `spread`, `winner` (서버가 계산해서 내려줌)

**결론**: `close` + `timestamp`만 필요

---

### 4. SpreadCandlestickChart

```
직접 fetch → GET /api/chart/normalized-strength → (위와 동일)
```

**결론**: `close` + `timestamp`만 필요

---

## ✅ 최종 분석: DB에 실제로 필요한 컬럼

### 차트 UI가 사용하는 것

| 컬럼                   | 사용 여부 | 용도                    |
| ---------------------- | --------- | ----------------------- |
| `asset`                | ✅        | 필터링                  |
| `timestamp`            | ✅        | 시간축                  |
| `close`                | ✅        | **모든 차트의 핵심**    |
| `open`                 | ❌        | 저장만 하고 안 씀       |
| `high`                 | ❌        | 저장만 하고 안 씀       |
| `low`                  | ❌        | 저장만 하고 안 씀       |
| `volume`               | ❌        | 저장만 하고 안 씀       |
| `volatility`           | ❌        | 프론트가 close로 재계산 |
| `averageVolatility`    | ❌        | 안 씀                   |
| `volatilityChangeRate` | ❌        | 안 씀                   |
| `volatilityScore`      | ❌        | 안 씀                   |
| `movementIntensity`    | ❌        | 안 씀                   |
| `trendStrength`        | ❌        | 안 씀                   |
| `relativePosition`     | ❌        | 안 씀                   |
| `rsi`                  | ❌        | 안 씀                   |

### volatility_snapshots 테이블

| 사용 여부 | 비고             |
| --------- | ---------------- |
| ❌        | 조회하는 곳 없음 |

---

## 🏗️ 전체 구조 정리 (권장안)

### 1. 유지할 것

| 항목                              | 설명                                          |
| --------------------------------- | --------------------------------------------- |
| `chart_data.asset`                | 필수                                          |
| `chart_data.timestamp`            | 필수                                          |
| `chart_data.close`                | **핵심** - 모든 차트가 이것만 씀              |
| `chart_data.open/high/low/volume` | 1m klines로 바꾸면 의미있어짐 (캔들차트 가능) |
| `fetchKlines` 함수                | 정산용으로 사용                               |
| `fetchCurrentPrice` 함수          | 실시간 가격용                                 |
| `calculateAverageVolatility`      | 정산 avgVol 계산용                            |
| `calculateNormalizedStrength`     | 정산 승자 판정용                              |

### 2. 제거/축소할 것

| 항목                                                       | 이유                |
| ---------------------------------------------------------- | ------------------- |
| `chart_data`의 파생지표 컬럼들                             | 저장만 하고 안 읽음 |
| - `volatility`, `averageVolatility`                        | 프론트가 재계산     |
| - `volatilityChangeRate`, `volatilityScore`                | 안 씀               |
| - `movementIntensity`, `trendStrength`, `relativePosition` | 안 씀               |
| - `rsi`                                                    | 안 씀               |
| `volatility_snapshots` 테이블                              | 조회처 없음         |
| `collect`에서 파생지표 계산 로직                           | 계산해봤자 안 씀    |

### 3. 추가할 것 (정산용)

| 항목                         | 설명                           |
| ---------------------------- | ------------------------------ |
| `rounds.paxg_start_price`    | 라운드 시작 PAXG 가격          |
| `rounds.paxg_end_price`      | 라운드 종료 PAXG 가격          |
| `rounds.btc_start_price`     | 라운드 시작 BTC 가격           |
| `rounds.btc_end_price`       | 라운드 종료 BTC 가격           |
| `rounds.paxg_avg_vol`        | PAXG avgVol (정산용)           |
| `rounds.btc_avg_vol`         | BTC avgVol (정산용)            |
| `rounds.price_snapshot_meta` | 가격 소스/시점 메타 (감사추적) |

---

## 🔧 구체적 액션

### A. collect 간소화 (차트팀 또는 직접)

```typescript
// 현재: 파생지표 12개 계산 + 저장
// 권장: close + timestamp만 저장

// 더 좋은 방향: 1m klines로 바꾸면 OHLCV 의미있어짐
const klines = await fetchKlines(asset, '1m', 1);
await db.insert(chartData).values({
  asset,
  timestamp: new Date(klines[0].closeTime),
  open: klines[0].open,
  high: klines[0].high,
  low: klines[0].low,
  close: klines[0].close,
  volume: klines[0].volume,
});
```

### B. 정산용 스키마 추가 (너)

```typescript
// db/schema/rounds.ts에 추가
paxgStartPrice: real('paxg_start_price'),
paxgEndPrice: real('paxg_end_price'),
btcStartPrice: real('btc_start_price'),
btcEndPrice: real('btc_end_price'),
paxgAvgVol: real('paxg_avg_vol'),
btcAvgVol: real('btc_avg_vol'),
priceSnapshotMeta: text('price_snapshot_meta'), // JSON
```

### C. 정산 서비스 함수 (너)

```typescript
// lib/rounds/priceSnapshot.service.ts
export async function captureRoundPrices(roundId: string, phase: 'start' | 'end') {
  const [paxg, btc] = await Promise.all([fetchCurrentPrice('PAXG'), fetchCurrentPrice('BTC')]);

  // 또는 1m klines close 사용
  // const paxgKline = await fetchKlines('PAXG', '1m', 1);
  // const price = paxgKline[0].close;

  // DB에 저장
}

export async function calculateSettlementAvgVol() {
  const paxgKlines = await fetchKlines('PAXG', '1h', 720);
  const btcKlines = await fetchKlines('BTC', '1h', 720);

  const paxgAvgVol = calculateAverageVolatility(
    paxgKlines.map((k) => k.close),
    30,
  );
  const btcAvgVol = calculateAverageVolatility(
    btcKlines.map((k) => k.close),
    30,
  );

  return { paxgAvgVol, btcAvgVol };
}
```

### D. 제거 가능한 것

| 파일/코드                     | 액션                      |
| ----------------------------- | ------------------------- |
| `volatility_snapshots` 테이블 | 삭제 또는 deprecated      |
| `collect`의 파생지표 계산     | 삭제                      |
| `chart_data`의 파생지표 컬럼  | 유지해도 되지만 null 허용 |
| `useVolatility` 훅            | 사용처 없으면 삭제        |
| `VolatilityChart` 컴포넌트    | 사용처 없으면 삭제        |

---

## 📋 요약

| 영역                     | 현재                     | 권장                                         |
| ------------------------ | ------------------------ | -------------------------------------------- |
| **chart_data 저장**      | ticker + 파생지표 12개   | `close` + `timestamp` (또는 1m klines OHLCV) |
| **volatility_snapshots** | 저장만                   | 삭제                                         |
| **정산 가격**            | 없음                     | rounds 테이블에 start/end/avgVol 저장        |
| **정산 avgVol**          | chart_data 의존 (불안정) | Binance 1h klines 직접 호출                  |
| **프론트 계산**          | 유지                     | 유지 (문제없음)                              |

이 구조로 가면:

1. 차트는 `close`만 있으면 다 그려짐 ✅
2. 정산은 차트 DB에 의존 안 하고 Binance 직접 호출 ✅
3. 불필요한 저장/계산 제거로 단순해짐 ✅

스키마 추가/서비스 구현 진행할까?
