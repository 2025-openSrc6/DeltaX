# Chart Module - 개발 작업 계획서

**작성자**: 김현준 (차트 개발 담당)  
**작성일**: 2025-01-XX  
**목표**: BTC, PAXG 실시간 가격 차트 및 변동성 비교 분석 구현

---

## 🎯 핵심 요구사항

### 1. 기본 기능

- ✅ BTC, PAXG 실시간 가격 수신 (WebSocket)
- ✅ 변동성 대비 변동률 비교 분석
- ✅ 차트 시각화 (라인/캔들스틱)
- ✅ 공유 데이터베이스 사용 (로컬 백엔드 없음)

### 2. 외부 데이터 소스

#### 우선순위 1: REST API 방식 (구현 간단, WebSocket 없음)

- **CoinGecko API** (무료): BTC, PAXG 모두 지원
  - 엔드포인트: `https://api.coingecko.com/api/v3/simple/price`
  - Rate Limit: 50 calls/min (무료)
  - 업데이트: 1분마다 polling
- **Binance API** (REST): BTC 지원
  - 엔드포인트: `https://api.binance.com/api/v3/ticker/price`
  - Rate Limit: 1200 requests/min
  - 업데이트: 더 자주 polling 가능

#### 우선순위 2: WebSocket (추후 구현)

- **Binance WebSocket**: BTC 실시간 스트림
- **CoinGecko**: WebSocket 지원 없음 → REST API 사용

**초기 구현 전략**: REST API로 시작 → 필요 시 WebSocket 추가

### 3. 데이터베이스

- **플랫폼**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM
- **공유 테이블**: users, bets, rounds (베팅 시스템과 공유)

---

## 📋 단계별 개발 작업 계획

### Phase 1: 데이터베이스 설계 및 구축 (2-3일)

#### 1.1 스키마 설계 ✅

- [ ] `chartData` 테이블 정의 (OHLCV 데이터)
- [ ] `volatilitySnapshots` 테이블 정의 (변동성 지표)
- [ ] 기존 테이블과의 관계 확인 (users, rounds)
- [ ] 인덱스 전략 수립

**출력물**:

- `db/schema/chartData.ts`
- `db/schema/volatilitySnapshots.ts`
- ERD 문서 업데이트

#### 1.2 Drizzle 스키마 작성

- [ ] `db/schema/chartData.ts` 작성
  - asset, timestamp, open, high, low, close, volume
  - createdAt, updatedAt
  - 인덱스: (asset, timestamp)
- [ ] `db/schema/volatilitySnapshots.ts` 작성
  - asset, timestamp, stdDev, percentChange, atr
  - bollingerBands (upper, middle, lower)
  - 인덱스: (asset, timestamp)
- [ ] `db/schema/index.ts`에 export 추가

**출력물**: 완성된 스키마 파일

#### 1.3 마이그레이션 생성 및 적용

- [ ] `drizzle-kit generate` 실행
- [ ] 로컬 D1에 마이그레이션 적용
- [ ] 원격 D1에 마이그레이션 적용 (팀 공유 DB)

**출력물**: 마이그레이션 파일

---

### Phase 2: 외부 API 연동 (2-3일)

#### 2.1 API 서비스 계층 구축

- [ ] `lib/services/priceApi.ts` 작성
  - CoinGecko API 연동
  - Binance API 연동
  - Fallback 전략 구현
- [ ] `lib/services/websocketApi.ts` 작성
  - Binance WebSocket (BTC)
  - CoinGecko Pro WebSocket (PAXG) 또는 Polling

**API 선택 가이드**:

- **PAXG**: CoinGecko API (REST) - WebSocket 없음
- **BTC**: Binance WebSocket Stream
- **Fallback**: CoinGecko REST API (무료)

**출력물**:

- `lib/services/priceApi.ts`
- `lib/services/websocketApi.ts`
- API 테스트 스크립트

#### 2.2 가격 데이터 수집 서비스

- [ ] `lib/services/priceCollector.ts` 작성
  - **실시간 가격 수집 로직**
    - CoinGecko API로 BTC, PAXG 가격 조회
    - 1분마다 polling (또는 사용자 요청 시)
  - **데이터 정규화**
    - PAXG: USD/oz (그대로 사용)
    - BTC: USD (그대로 사용)
    - 타임스탬프: Unix timestamp (초 단위)
  - **DB 저장 로직**
    - `chartData` 테이블에 OHLCV 저장
    - 중복 방지: (asset, timestamp) unique 제약
    - 1분 캔들로 저장 (open=high=low=close, volume=0 또는 추정값)

**구현 전략**:

- 초기에는 단순 가격만 저장 (OHLCV는 나중에 확장)
- 타임스탬프는 1분 단위로 정규화

**출력물**: 가격 수집 서비스

---

### Phase 3: 변동성 계산 로직 (2일)

#### 3.1 변동성 계산 유틸리티

- [ ] `lib/utils/volatility.ts` 작성
  - **표준편차 계산** (Standard Deviation)
    - 공식: sqrt(sum((price - mean)²) / n)
    - 기간: 24시간 데이터 기준
  - **변동률 계산** (Percent Change)
    - 공식: ((현재가 - 시작가) / 시작가) \* 100
  - **변동성 대비 변동률** (Volatility-Adjusted Return)
    - 공식: 변동률 / 표준편차
    - 의미: 같은 변동성 대비 얼마나 수익률이 높은지
  - ATR (Average True Range) 계산 (선택)
  - 볼린저 밴드 계산 (선택)
- [ ] `lib/utils/comparison.ts` 작성
  - **변동성 대비 변동률 비교**
    ```typescript
    // 예시
    BTC: 변동률 3.2%, 표준편차 2.5 → 비율 1.28
    PAXG: 변동률 2.1%, 표준편차 1.8 → 비율 1.17
    → BTC가 변동성 대비 수익률이 더 높음 (1.28 > 1.17)
    ```
  - **추천 로직**
    - 비율이 높은 자산이 "더 가치있음"
    - 차이가 10% 미만이면 "비슷함"으로 판단

**출력물**:

- `lib/utils/volatility.ts`
- `lib/utils/comparison.ts`
- 단위 테스트

#### 3.2 배치 계산 서비스

- [ ] `lib/services/volatilityCalculator.ts` 작성
  - 주기적 변동성 계산 (1분, 5분 간격)
  - DB 저장 로직
- [ ] Cloudflare Workers Cron Trigger 설정 (선택사항)

**출력물**: 변동성 계산 서비스

---

### Phase 4: API 엔드포인트 구현 (2-3일)

#### 4.1 REST API 라우트

- [ ] `app/api/chart/price/route.ts` - 실시간 가격 조회
- [ ] `app/api/chart/historical/route.ts` - 과거 가격 데이터
- [ ] `app/api/chart/volatility/route.ts` - 변동성 지표 조회
- [ ] `app/api/chart/compare/route.ts` - BTC vs PAXG 비교

**API 스펙**:

```typescript
GET /api/chart/price?asset=BTC
→ { asset: 'BTC', price: 45000, timestamp: 1234567890 }

GET /api/chart/historical?asset=BTC&range=24h
→ PriceData[]

GET /api/chart/volatility?asset=BTC&period=24h
→ { stdDev: 250, percentChange: 2.5, ... }

GET /api/chart/compare?assets=BTC,PAXG&range=24h
→ {
    btc: {
      volatility: 2.5,      // 표준편차
      return: 3.2,          // 변동률 (%)
      adjustedReturn: 1.28  // 변동성 대비 변동률
    },
    paxg: {
      volatility: 1.8,
      return: 2.1,
      adjustedReturn: 1.17
    },
    winner: 'BTC',          // 더 가치있는 자산
    confidence: 0.85,       // 신뢰도 (0-1)
    reason: 'BTC shows 9.4% higher volatility-adjusted return'
  }
```

**출력물**: API 라우트 파일들

#### 4.2 WebSocket 서버 (선택사항)

- [ ] `app/api/chart/realtime/route.ts` - WebSocket 핸들러
- [ ] 또는 Cloudflare Workers에서 별도 구현

**출력물**: WebSocket 핸들러

---

### Phase 5: 타입 정의 (1일)

#### 5.1 TypeScript 타입 정의

- [ ] `types/chart.ts` 작성
  - `AssetType`: 'BTC' | 'PAXG'
  - `PriceData`: 가격 데이터 인터페이스
  - `VolatilityMetrics`: 변동성 지표 인터페이스
  - `ComparisonResult`: 비교 결과 인터페이스
  - `TimeRange`: '1h' | '24h' | '7d' | '30d'

**출력물**: `types/chart.ts`

---

### Phase 6: 상태 관리 (Zustand) (1-2일)

#### 6.1 Chart Store

- [ ] `store/useChartStore.ts` 작성
  - 실시간 가격 데이터
  - 과거 가격 데이터
  - 변동성 데이터
  - 비교 결과
  - 설정 (시간 범위, 자산 선택 등)

**출력물**: `store/useChartStore.ts`

---

### Phase 7: 프론트엔드 컴포넌트 (4-5일)

#### 7.1 기본 컴포넌트

- [ ] `app/components/chart/ChartContainer.tsx` - 메인 컨테이너
- [ ] `app/components/chart/PriceChart.tsx` - 가격 차트
- [ ] `app/components/chart/ChartHeader.tsx` - 설정 헤더
- [ ] `app/components/chart/VolatilityPanel.tsx` - 변동성 패널
- [ ] `app/components/chart/ComparisonCard.tsx` - 비교 결과 카드

**차트 라이브러리**: Recharts (이미 사용 중인 것으로 보임)

#### 7.2 페이지 구현

- [ ] `app/chart/page.tsx` - 차트 페이지

#### 7.3 훅 구현

- [ ] `hooks/useWebSocket.ts` - WebSocket 연결 훅
- [ ] `hooks/usePriceData.ts` - 가격 데이터 조회 훅
- [ ] `hooks/useVolatility.ts` - 변동성 데이터 조회 훅

**출력물**: 모든 프론트엔드 컴포넌트

---

### Phase 8: 통합 및 테스트 (2-3일)

#### 8.1 통합 테스트

- [ ] API 엔드포인트 테스트
- [ ] WebSocket 연결 테스트
- [ ] 데이터베이스 쿼리 성능 테스트
- [ ] 프론트엔드 E2E 테스트

#### 8.2 최적화

- [ ] 캐싱 전략 (In-Memory 또는 Cloudflare KV)
- [ ] 데이터베이스 쿼리 최적화
- [ ] 프론트엔드 렌더링 최적화

**출력물**: 테스트 결과 및 최적화 리포트

---

## 🔧 기술 스택

### 백엔드

- **프레임워크**: Next.js 14+ (App Router)
- **데이터베이스**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM
- **외부 API**:
  - CoinGecko API (REST)
  - Binance WebSocket API

### 프론트엔드

- **프레임워크**: React 18+ (Next.js)
- **상태 관리**: Zustand
- **차트 라이브러리**: Recharts
- **스타일링**: Tailwind CSS

### 개발 도구

- **타입**: TypeScript
- **테스팅**: (선택사항) Vitest
- **배포**: Cloudflare Pages

---

## 📊 데이터 흐름

```
외부 API (CoinGecko/Binance)
    ↓
가격 수집 서비스 (priceCollector)
    ↓
D1 데이터베이스 (chartData)
    ↓
변동성 계산 서비스 (volatilityCalculator)
    ↓
D1 데이터베이스 (volatilitySnapshots)
    ↓
API 엔드포인트 (/api/chart/*)
    ↓
Zustand Store (useChartStore)
    ↓
React 컴포넌트 (차트 UI)
```

---

## ⚠️ 주의사항

### 1. 공유 데이터베이스

- 기존 테이블 (users, bets, rounds)과 충돌하지 않도록 주의
- 마이그레이션 전 팀원과 협의
- 테이블명은 `chart_*` 접두사 사용 권장

### 2. 외부 API 제한

- **CoinGecko 무료**: 50 calls/min
- **Binance**: 1200 requests/min
- Rate limiting 구현 필수

### 3. WebSocket 연결 관리

- 클라이언트 측 재연결 로직
- 서버 측 연결 풀 관리
- 비용 최적화 (불필요한 연결 방지)

### 4. 데이터 저장 전략

- 실시간 데이터: 1분 간격 저장
- 과거 데이터: 필요 시만 조회 (DB 용량 절약)
- 데이터 보관 기간: 90일 (정책 확인 필요)

---

## 🚀 우선순위 및 구현 전략

### 필수 (MVP) - 1주 목표

1. ✅ **데이터베이스 스키마 작성** (Phase 1)
2. ✅ **REST API로 가격 조회** (Phase 2, 4)
   - CoinGecko API 연동
   - `/api/chart/price` 엔드포인트
3. ✅ **변동성 계산 로직** (Phase 3)
   - 표준편차, 변동률 계산
   - 비교 로직 구현
4. ✅ **기본 차트 시각화** (Phase 7)
   - 라인 차트
   - 비교 결과 표시

### 선택 (추가 기능) - 2주차 이후

- **WebSocket 실시간 업데이트** (Phase 2.2)
  - Binance WebSocket (BTC)
  - 클라이언트 측 polling으로도 가능
- **고급 지표** (RSI, MACD) (Phase 3)
- **베팅 마커 연동** (베팅 시스템과 협업 필요)

### 구현 순서 권장사항

1. **1일차**: 스키마 작성 + 마이그레이션
2. **2일차**: CoinGecko API 연동 + DB 저장
3. **3일차**: 변동성 계산 로직
4. **4일차**: API 엔드포인트 구현
5. **5일차**: 기본 프론트엔드 (차트 표시)
6. **6-7일차**: 비교 로직 + UI 개선

---

## 📝 체크리스트

### Phase 1: 데이터베이스

- [ ] 스키마 설계 완료
- [ ] Drizzle 스키마 작성
- [ ] 마이그레이션 생성
- [ ] 로컬 D1 테스트
- [ ] 원격 D1 적용

### Phase 2: API 연동

- [ ] CoinGecko API 연동
- [ ] Binance API 연동
- [ ] 가격 수집 서비스
- [ ] DB 저장 로직

### Phase 3: 변동성

- [ ] 변동성 계산 함수
- [ ] 비교 로직
- [ ] 배치 계산 서비스

### Phase 4: API

- [ ] /api/chart/price
- [ ] /api/chart/historical
- [ ] /api/chart/volatility
- [ ] /api/chart/compare

### Phase 5-7: 프론트엔드

- [ ] 타입 정의
- [ ] Zustand Store
- [ ] 컴포넌트 구현
- [ ] 페이지 구현

### Phase 8: 테스트

- [ ] 통합 테스트
- [ ] 최적화
- [ ] 문서화

---

## 🔍 부족한 부분 보완 및 구체화

### 1. 가격 데이터 수집 주기

**문제**: WebSocket이 없을 경우 얼마나 자주 업데이트할까?  
**해결책**:

- **클라이언트 측**: 사용자가 차트 페이지에 있을 때만 1분마다 polling
- **서버 측**: Cron Job으로 1분마다 저장 (선택사항)
- **초기**: 사용자 요청 시마다 최신 가격 조회 (간단)

### 2. 변동성 대비 변동률 비교 구체화

**구현 로직**:

```typescript
// 24시간 데이터 기준
function calculateVolatilityAdjustedReturn(prices: number[]): number {
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const stdDev = Math.sqrt(
    prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length,
  );
  const returnPercent = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
  return returnPercent / stdDev; // 변동성 대비 변동률
}

// 비교
const btcRatio = calculateVolatilityAdjustedReturn(btcPrices);
const paxgRatio = calculateVolatilityAdjustedReturn(paxgPrices);
const winner = btcRatio > paxgRatio ? 'BTC' : 'PAXG';
```

### 3. 데이터 보관 전략

**문제**: 얼마나 많은 데이터를 저장할까?  
**해결책**:

- **실시간 데이터**: 최근 90일만 보관
- **과거 데이터**: 필요 시 외부 API에서 조회
- **변동성 스냅샷**: 최근 30일만 보관

### 4. 베팅 시스템과의 연동

**현재 상태**: 독립적으로 진행 가능  
**향후 연동**:

- `rounds` 테이블의 `goldStartPrice`, `btcStartPrice` 참조 가능
- 베팅 마커는 나중에 구현 (베팅 시스템 담당자와 협의 후)

### 5. 에러 처리 및 Fallback

**전략**:

- API 실패 시 마지막 저장된 가격 사용
- 클라이언트 측 캐싱 (localStorage 또는 Zustand persist)
- 사용자에게 "데이터 오래됨" 표시

---

## 📚 참고 자료

### API 문서

- [CoinGecko API Docs](https://www.coingecko.com/en/api/documentation)
- [Binance REST API](https://binance-docs.github.io/apidocs/spot/en/#introduction)
- [Binance WebSocket Streams](https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams)

### 기술 문서

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Recharts Docs](https://recharts.org/)

### 계산 참고

- [Volatility-Adjusted Return](https://www.investopedia.com/terms/s/sharperatio.asp)
- [Bollinger Bands](https://www.investopedia.com/terms/b/bollingerbands.asp)

---

**작성 완료**: 2025-01-XX  
**다음 단계**: Phase 1 시작 - 데이터베이스 스키마 작성

**질문이나 수정사항이 있으면 언제든 알려주세요!** 🚀
