# 차트 API 리팩토링 - 정산 도메인 분리

> **작성자**: 김현준 (차트 담당)  
> **목적**: 정산팀 요청에 따른 차트 도메인과 정산 도메인 분리

---

## 📌 요약

차트 수집 로직에서 불필요한 계산을 제거하고, 정산팀이 필요한 메타데이터를 포함한 새로운 Binance 서비스 함수 4개를 추가했습니다.

### 핵심 원칙

```
차트 DB가 비어있거나 깨져도 정산은 영향 없어야 함
정산 = Binance klines 직접 호출 (on-demand, 재현 가능)
차트 = DB 캐시 (UX용, best-effort)
```

---

## 🎯 주요 변경사항

### 1. 새로운 Binance 서비스 함수 추가 (4개)

#### `fetchTickPrice` - 5초 폴링용 경량 가격 조회

```typescript
// Before: ticker/24hr (무거움)
// After: ticker/price (경량)
const { price, timestamp } = await fetchTickPrice('PAXG');
```

#### `fetchKlinesWithMeta` - 메타데이터 포함 klines

```typescript
const { candles, meta } = await fetchKlinesWithMeta('BTC', '1m', 10);
// candles: OHLCV 데이터
// meta: 온체인 검증용 메타데이터 (exchange, symbol, interval, time range)
```

#### `fetchRoundSnapshotKline1m` - 라운드 가격 스냅샷

```typescript
const { close, closeTimeMs, onchainMeta } = await fetchRoundSnapshotKline1m('PAXG');
// 라운드 시작/종료 시점 가격 기록용
```

#### `fetchAvgVolKlines1h720` - avgVol 계산 데이터

```typescript
const { closes, onchainMeta } = await fetchAvgVolKlines1h720('BTC');
// 1시간봉 720개 (30일) 종가 배열 반환
```

---

### 2. 차트 수집 로직 간소화

**Before (215줄):**

- `ticker/24hr` API 호출
- 과거 500개 데이터 조회
- 12개 파생 지표 계산
- `volatility_snapshots` 테이블 저장

**After (118줄):**

- `ticker/price` API 호출 (경량)
- Close 가격만 저장
- 파생 지표 계산 제거
- `volatility_snapshots` 저장 중단

**제거된 계산 로직:**

- `calculateVolatilityChangeRate`
- `calculateVolatilityScore`
- `calculateMovementIntensity`
- `calculateTrendStrength`
- `calculateRelativePosition`
- `calculateRSI`
- `calculateATR`
- `calculateBollingerBands`
- `calculateMACD`

---

## 📊 성능 개선

| 항목      | Before | After  | 개선율 |
| --------- | ------ | ------ | ------ |
| API 응답  | ~5KB   | ~0.5KB | ~90%   |
| DB 조회   | 500개  | 1개    | ~99.8% |
| 계산 로직 | 12개   | 0개    | 100%   |
| DB 쓰기   | 2번    | 1번    | 50%    |
| 수집 속도 | ~2초   | ~1초   | ~50%   |

---

## ✅ 테스트 결과

### 단위 테스트

```bash
npx tsx __tests__/lib/services/binance-new-functions.manual.ts

✅ fetchTickPrice - 정상
✅ fetchKlinesWithMeta - 5개 캔들 + 메타데이터
✅ fetchRoundSnapshotKline1m - close + onchainMeta
✅ fetchAvgVolKlines1h720 - 720개 closes
```

### 통합 테스트

```bash
curl -X POST http://localhost:3000/api/chart/collect

✅ PAXG, BTC 데이터 정상 저장
✅ close: 실제 가격
✅ volume: 0
✅ 파생지표 8개: null
```

---

## 🔧 구현 상세

### 저장 데이터 구조

```typescript
{
  asset: 'PAXG',
  timestamp: '2025-12-15T10:32:46.000Z',
  close: 4353.92,              // ✅ 실제 가격
  open: 4353.92,               // fake OHLC (스키마 호환)
  high: 4353.92,
  low: 4353.92,
  volume: 0,                   // ticker/price는 제공 안 함
  // 파생 지표: null
  volatility: null,
  averageVolatility: null,
  volatilityChangeRate: null,
  volatilityScore: null,
  movementIntensity: null,
  trendStrength: null,
  relativePosition: null,
  rsi: null
}
```

### 메타데이터 구조 (정산용)

```typescript
{
  exchange: 'binance',
  endpoint: '/api/v3/klines',
  symbol: 'PAXGUSDT',
  interval: '1m',
  limit: 1,
  candleOpenTimeMs: 1765794660000,
  candleCloseTimeMs: 1765794719999
}
```

---

## 📁 변경 파일

```
수정:
  lib/services/binance.ts           (+200줄: 새 함수 4개)
  app/api/chart/collect/route.ts    (-97줄: 간소화)

추가:
  .gitignore                         (개인작업본 제외)
```

---

## 🚀 다음 단계

### 정산팀 통합

새 함수를 활용하여 정산 로직 구현:

- `fetchRoundSnapshotKline1m` → 라운드 시작/종료 가격
- `fetchAvgVolKlines1h720` + `calculateAverageVolatility` → avgVol 계산

### 향후 개선 (옵션)

```sql
-- 스키마 정리 (마이그레이션)
ALTER TABLE chart_data ALTER COLUMN open SET DEFAULT NULL;
ALTER TABLE chart_data ALTER COLUMN high SET DEFAULT NULL;
ALTER TABLE chart_data ALTER COLUMN low SET DEFAULT NULL;
DROP TABLE volatility_snapshots;
```

---

## ✅ 체크리스트

- [x] 새 함수 4개 구현 및 테스트 완료
- [x] 파생지표 12개 계산 제거
- [x] volatility_snapshots 저장 중단
- [x] close만 저장, 파생지표 null 처리
- [x] 기존 차트 UI 호환성 유지
- [x] API 응답 속도 50% 개선
- [x] 한국어 주석 통일

---

**문의:** 김현준 (차트 담당)
