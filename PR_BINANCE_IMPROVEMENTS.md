## Summary

Binance API 호출의 안정성과 신뢰성을 크게 향상시키는 3단계 개선 작업을 완료했습니다.

### 주요 변경사항

1. **Zod 스키마 검증** - API 응답 데이터의 런타임 타입 안정성 보장
2. **Retry 로직** - Exponential backoff를 사용한 자동 재시도
3. **Rate Limit 처리** - 클라이언트/서버 양측 rate limit 관리

---

## 1️⃣ Zod Schema Validation

### 구현 내용

- `BinanceKlineRawSchema`: Binance klines API 응답 구조 검증
- `BinanceKlineArraySchema`: klines 배열 검증
- `BinanceTickerSchema`: 24hr ticker API 응답 검증

### 이점

- ✅ 런타임에서 API 응답 데이터 타입 안정성 보장
- ✅ 예상치 못한 데이터 구조 변경 즉시 감지
- ✅ Type assertion 제거로 더 안전한 코드

### 코드 예시

```typescript
const validatedData = BinanceKlineArraySchema.parse(data);
```

---

## 2️⃣ Retry Logic with Exponential Backoff

### 구현 내용

- **설정**: maxRetries: 3회, initialDelay: 1초, maxDelay: 10초
- **Backoff 전략**: 1초 → 2초 → 4초 (exponential)
- **재시도 조건**: 네트워크 에러, 5xx 서버 에러, 429 Rate Limit

### 이점

- ✅ 일시적인 네트워크 장애 자동 복구
- ✅ 서버 과부하(5xx) 시 재시도로 성공률 향상
- ✅ Rate Limit 에러 대응

### 코드 예시

```typescript
return retryWithBackoff(async () => {
  const response = await fetch(url);
  // ...
});
```

---

## 3️⃣ Rate Limit Handling

### 구현 내용

#### 클라이언트 사이드

- **RateLimitTracker 클래스**: 1분당 최대 1,200 요청 추적
- **Rolling Window 카운팅**: 시간 윈도우 기반 요청 수 관리
- **자동 대기**: 제한 도달 시 자동으로 윈도우 리셋까지 대기

#### 서버 사이드

- **429 응답 처리**: Retry-After 헤더 확인
- **동적 대기**: 서버 지시에 따른 대기 시간 조정

#### 모니터링

- **getRateLimitStats()**: 실시간 사용량 추적 함수 제공
  - `requestCount`: 현재 윈도우의 요청 수
  - `remainingRequests`: 남은 요청 가능 수
  - `windowStart`: 윈도우 시작 시간

### 이점

- ✅ Binance API 차단 방지
- ✅ 자동 throttling으로 안정적인 API 호출
- ✅ 실시간 사용량 모니터링 가능

### 코드 예시

```typescript
// 요청 전 자동 체크
await rateLimitTracker.checkAndWait();

// 서버 rate limit 응답 처리
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
  await new Promise((resolve) => setTimeout(resolve, waitTime));
}
```

---

## Test Results

### 로컬 테스트 성공 ✅

#### POST /api/chart/collect

```json
{
  "success": true,
  "data": {
    "collected": {
      "PAXG": {
        "chartData": "f7b202c7-9350-4e30-a29d-2d0188317cbc",
        "volatilitySnapshot": "02608f51-0268-4422-9786-7be6d24a26a6"
      },
      "BTC": {
        "chartData": "1d4667d1-ee11-4b81-9558-e30d7a0b7228",
        "volatilitySnapshot": "757f5e8b-50b0-4d79-ad4b-82e76aef7fbd"
      }
    },
    "timestamp": "2025-11-19T05:53:13.294Z"
  }
}
```

#### GET /api/chart/collect

- ✅ 최신 차트 데이터 정상 조회
- ✅ PAXG, BTC 데이터 포함
- ✅ 변동성 지표 정상 계산 (RSI, volatility, trendStrength 등)

---

## 사용 방법

### 1. 기본 API 호출

기존과 동일하게 사용하면 자동으로 검증, 재시도, rate limit이 적용됩니다.

```typescript
import { fetchKlines, fetchCurrentPrice } from '@/lib/services/binance';

// 자동으로 Zod 검증 + retry + rate limit 적용
const klines = await fetchKlines('BTC', '1m', 100);
const price = await fetchCurrentPrice('PAXG');
```

### 2. Rate Limit 모니터링

```typescript
import { getRateLimitStats } from '@/lib/services/binance';

const stats = getRateLimitStats();
console.log(`사용: ${stats.requestCount}/1200`);
console.log(`남은 요청: ${stats.remainingRequests}`);
```

### 3. 에러 처리

```typescript
try {
  const klines = await fetchKlines('BTC');
} catch (error) {
  if (error instanceof z.ZodError) {
    // Zod 검증 실패
    console.error('API 응답 형식이 변경되었습니다');
  } else if (error.message.includes('429')) {
    // Rate limit (3회 재시도 후에도 실패)
    console.error('Rate limit 초과');
  } else {
    // 기타 에러
    console.error('API 호출 실패');
  }
}
```

---

## 기술적 결정 사항

### Binance API Rate Limits

- **공식 제한**: 1,200 requests/minute (IP 기준)
- **현재 사용량**: 2개 asset × 100 limit = 매 호출마다 ~2 가중치
- **예상 사용**: 1분마다 호출 시 2 가중치/분 → **여유 충분**
- **대비책**: 429 응답 처리 + 클라이언트 사이드 throttling

### Retry 전략

- **재시도 대상**: 네트워크 에러, 5xx, 429
- **재시도 제외**: 4xx (429 제외), 잘못된 요청
- **Backoff**: Exponential (서버 부하 분산)

### Zod vs 다른 검증 라이브러리

- **선택 이유**: TypeScript와 완벽한 통합, 가볍고 빠름
- **대안**: Joi, Yup (더 무거움)

---
