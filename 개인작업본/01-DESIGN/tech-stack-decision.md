# Chart Module - 기술 스택 결정

**작성자**: 김현준
**작성일**: 2025-11-11
**버전**: 1.0
**상태**: 검증 진행 중

---

## 📊 차트 라이브러리 선정

### 후보 라이브러리 비교

| 항목                | Recharts  | TradingView Lightweight | Chart.js         | ApexCharts          |
| ------------------- | --------- | ----------------------- | ---------------- | ------------------- |
| **번들 크기**       | ~280KB    | ~45KB                   | ~150KB           | ~350KB              |
| **React 지원**      | ✅ Native | 🟡 Wrapper 필요         | 🟡 Wrapper 필요  | ✅ react-apexcharts |
| **캔들스틱**        | ✅ 지원   | ✅ 최적화됨             | ❌ 플러그인 필요 | ✅ 지원             |
| **실시간 업데이트** | 🟡 보통   | ✅ 우수                 | 🟡 보통          | ✅ 우수             |
| **커스터마이징**    | ✅ 쉬움   | 🟡 보통                 | ✅ 쉬움          | ✅ 쉬움             |
| **성능**            | 🟡 중간   | ✅ 매우 우수            | 🟡 중간          | ✅ 우수             |
| **학습 곡선**       | ✅ 낮음   | 🟡 중간                 | ✅ 낮음          | 🟡 중간             |
| **라이선스**        | MIT       | Apache 2.0              | MIT              | MIT                 |
| **유지보수**        | ✅ 활발   | ✅ 활발                 | ✅ 활발          | ✅ 활발             |

### 선정 결과: **Recharts** (1차) + **TradingView Lightweight** (추후 마이그레이션)

#### 선정 이유

**Phase 1 (2-3주차): Recharts 사용**

1. **빠른 프로토타이핑**: React 네이티브 지원으로 개발 속도 빠름
2. **낮은 학습 곡선**: 선언적 API로 팀원들도 쉽게 이해 가능
3. **충분한 기능**: 초기 MVP에 필요한 모든 차트 타입 지원
4. **좋은 문서**: 예제 코드가 풍부하여 빠른 개발 가능

```bash
npm install recharts
```

**Phase 2 (최적화 시): TradingView Lightweight Charts 마이그레이션 고려**

1. **성능**: 대용량 데이터 처리에 최적화 (100,000+ 데이터 포인트)
2. **전문성**: 금융 차트에 특화된 UX
3. **번들 크기**: Recharts 대비 1/6 크기

```bash
npm install lightweight-charts
```

#### 코드 예시 (Recharts)

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export function PriceChart({ data }: { data: PriceData[] }) {
  return (
    <LineChart width={600} height={400} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="timestamp" />
      <YAxis />
      <Tooltip />
      <Line type="monotone" dataKey="price" stroke="#FFD700" />
    </LineChart>
  );
}
```

---

## 🔌 WebSocket 아키텍처

### Socket.io vs Native WebSocket

| 항목                | Socket.io          | Native WebSocket    |
| ------------------- | ------------------ | ------------------- |
| **브라우저 호환성** | ✅ IE8+ (Polyfill) | 🟡 Modern browsers  |
| **자동 재연결**     | ✅ Built-in        | ❌ 직접 구현 필요   |
| **Room/Namespace**  | ✅ 지원            | ❌ 직접 구현 필요   |
| **번들 크기**       | ~60KB              | ~0KB (Native API)   |
| **메시지 형식**     | JSON (자동)        | String (수동 파싱)  |
| **서버 구현**       | Socket.io Server   | ws / uWebSockets.js |

### 선정 결과: **Socket.io**

#### 선정 이유

1. **자동 재연결**: 네트워크 불안정 시 자동으로 재연결 시도
2. **Room 기능**: 자산별 구독 관리가 쉬움
   ```typescript
   socket.join('asset:PAXG');
   io.to('asset:PAXG').emit('price-update', data);
   ```
3. **Fallback**: WebSocket 실패 시 Long Polling으로 자동 전환
4. **개발 생산성**: 보일러플레이트 코드 최소화

#### 아키텍처 다이어그램

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Browser    │          │   Next.js    │          │  Binance API │
│   (Client)   │          │  WebSocket   │          │  (External)  │
│              │          │   Server     │          │              │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │
       │ 1. Connect              │                         │
       ├────────────────────────>│                         │
       │                         │                         │
       │ 2. Subscribe(['PAXG'])  │                         │
       ├────────────────────────>│                         │
       │                         │ 3. Fetch Price          │
       │                         ├────────────────────────>│
       │                         │                         │
       │                         │ 4. Price Data           │
       │                         │<────────────────────────┤
       │ 5. price-update         │                         │
       │<────────────────────────┤                         │
       │ (every 1 second)        │                         │
       │                         │                         │
```

#### 연결 관리 전략

```typescript
// hooks/useWebSocket.ts
const connect = useCallback((assets: AssetType[]) => {
  const socket = io({
    path: '/api/chart/realtime',
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('WebSocket connected');
    socket.emit('subscribe', assets);
  });

  socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnecting... Attempt ${attempt}`);
  });

  return socket;
}, []);
```

---

## 🗄️ 데이터베이스 & ORM

### PostgreSQL + Prisma

#### 선정 이유

1. **타입 안전성**: Prisma가 TypeScript 타입 자동 생성
2. **마이그레이션**: 스키마 변경 관리가 쉬움
3. **성능**: PostgreSQL의 시계열 데이터 최적화 (TimescaleDB 확장 가능)
4. **팀 협업**: 같은 스키마 파일로 일관성 유지

#### Prisma Schema 예시

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model ChartData {
  id        String   @id @default(cuid())
  asset     String
  timestamp DateTime
  open      Float
  high      Float
  low       Float
  close     Float
  volume    Float

  @@index([asset, timestamp])
  @@unique([asset, timestamp])
}
```

#### 대안: Drizzle ORM (고려 중)

**장점**:

- 더 가벼움 (번들 크기)
- SQL-like 쿼리 작성
- 타입 안전성 동일

**단점**:

- Prisma보다 생태계 작음
- 마이그레이션 도구 미성숙

**결정**: **Prisma 우선 사용**, 성능 이슈 시 Drizzle 전환 고려

---

## 💾 캐싱 전략

### Redis vs In-Memory Cache

| 항목              | Redis             | Node.js Cache (lru-cache) |
| ----------------- | ----------------- | ------------------------- |
| **분산 환경**     | ✅ 지원           | ❌ 단일 프로세스          |
| **데이터 영속성** | ✅ 가능           | ❌ 휘발성                 |
| **TTL 관리**      | ✅ Built-in       | ✅ 라이브러리 지원        |
| **복잡도**        | 🟡 별도 서버 필요 | ✅ 간단                   |
| **성능**          | ✅ 매우 빠름      | ✅ 더 빠름 (메모리 직접)  |

### 선정 결과: **하이브리드**

#### Phase 1: In-Memory Cache (개발 단계)

```typescript
import { LRUCache } from 'lru-cache';

const priceCache = new LRUCache<string, PriceData>({
  max: 1000,
  ttl: 5000, // 5초
});

// 사용 예
priceCache.set('PAXG:latest', priceData);
```

#### Phase 2: Redis (프로덕션)

```typescript
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// 사용 예
await redis.setex('chart:price:PAXG:latest', 5, JSON.stringify(priceData));
```

---

## 📡 외부 API 선정

### 가격 데이터 소스

#### 1차 소스: **CoinGecko API**

**장점**:

- 무료 티어: 50 calls/min
- PAXG 지원
- 안정적인 서비스
- 24시간 변동 데이터 제공

**제약사항**:

- Rate Limit: 50 calls/min (무료)
- 실시간 업데이트 1분 지연

```typescript
// services/api/coingecko.ts
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export async function fetchPrice(asset: AssetType): Promise<PriceData> {
  const coinId = COIN_IDS[asset]; // 'pax-gold', 'bitcoin', etc.
  const response = await fetch(
    `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
  );
  return response.json();
}
```

#### 2차 소스 (Fallback): **Binance API**

**장점**:

- 완전 무료
- Rate Limit: 1200 requests/min
- 실시간 WebSocket
- 캔들스틱 데이터 제공

**제약사항**:

- PAXG 지원 안 함 (대안: PAXUSDT)

```typescript
// services/api/binance.ts
const BINANCE_BASE = 'https://api.binance.com/api/v3';

export async function fetchKlines(
  symbol: string,
  interval: '1m' | '1h' | '1d' = '1h',
  limit: number = 100,
): Promise<CandlestickData[]> {
  const response = await fetch(
    `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  );
  return response.json();
}
```

#### Rate Limit 관리 전략

```typescript
// middleware/rateLimit.ts
import { LRUCache } from 'lru-cache';

const rateLimit = new LRUCache({
  max: 500,
  ttl: 60000, // 1분
});

export function checkRateLimit(token: string, limit: number): boolean {
  const count = (rateLimit.get(token) as number) || 0;
  if (count >= limit) return false;

  rateLimit.set(token, count + 1);
  return true;
}
```

---

## 🎨 UI 라이브러리

### shadcn/ui + Tailwind CSS

#### 선정 이유

1. **복사-붙여넣기 방식**: 의존성 최소화
2. **Radix UI 기반**: 접근성 (a11y) 보장
3. **커스터마이징**: 완전한 제어 가능
4. **Tailwind 통합**: 디자인 시스템 일관성

```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card select
```

#### 컴포넌트 예시

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function VolatilityCard({ asset }: { asset: AssetType }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{asset} Volatility</CardTitle>
      </CardHeader>
      <CardContent>{/* Metrics */}</CardContent>
    </Card>
  );
}
```

---

## 📦 상태 관리

### Zustand

#### 선정 이유

1. **번들 크기**: ~1KB (Redux: ~10KB)
2. **보일러플레이트 최소화**: 간결한 API
3. **TypeScript 지원**: 완벽한 타입 추론
4. **DevTools**: Redux DevTools 호환
5. **React 외부 사용 가능**: API 레이어에서도 접근 가능

```typescript
// store/useChartStore.ts
import { create } from 'zustand';

interface ChartStore {
  config: ChartConfig;
  realtimeData: Map<AssetType, PriceData>;
  setViewMode: (mode: ViewMode) => void;
}

export const useChartStore = create<ChartStore>((set) => ({
  config: { viewMode: 'dual', ... },
  realtimeData: new Map(),
  setViewMode: (mode) => set((state) => ({
    config: { ...state.config, viewMode: mode }
  })),
}));
```

---

## 📋 최종 기술 스택 요약

### Frontend

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "recharts": "^2.10.0",
    "zustand": "^4.4.0",
    "socket.io-client": "^4.6.0",
    "@radix-ui/react-select": "^2.0.0",
    "tailwindcss": "^3.3.0",
    "class-variance-authority": "^0.7.0"
  }
}
```

### Backend

```json
{
  "dependencies": {
    "socket.io": "^4.6.0",
    "@prisma/client": "^5.0.0",
    "ioredis": "^5.3.0",
    "lru-cache": "^10.0.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0"
  }
}
```

### 개발 도구

```json
{
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

---

## ⚠️ 리스크 및 대응 방안

### 1. 성능 리스크

**문제**: Recharts가 대용량 데이터 처리 시 느려질 수 있음

**대응**:

- Phase 1에서 모니터링
- 1,000개 이상 데이터 포인트 시 데이터 샘플링
- 필요 시 TradingView Lightweight Charts로 마이그레이션

### 2. Rate Limit 리스크

**문제**: CoinGecko 무료 티어 제한 (50 calls/min)

**대응**:

- 캐싱 레이어 구축 (Redis)
- Fallback API (Binance) 준비
- 유료 플랜 전환 고려 (Pro: $129/month, 500 calls/min)

### 3. WebSocket 안정성

**문제**: 네트워크 불안정 시 연결 끊김

**대응**:

- Socket.io 자동 재연결
- Heartbeat 메커니즘 (30초마다 ping)
- 재연결 실패 시 Long Polling으로 폴백

---

## 🚀 Next Steps

1. ✅ 기술 스택 문서 완성
2. [ ] 팀원 리뷰 및 승인
3. [ ] package.json 생성 및 패키지 설치
4. [ ] 개발 환경 구축 (ESLint, Prettier 설정)
5. [ ] Hello World 차트 구현 (POC)

---

## 📝 변경 이력

| 날짜       | 버전 | 변경 내용 | 작성자 |
| ---------- | ---- | --------- | ------ |
| 2025-11-11 | 1.0  | 초안 작성 | 김현준 |

---

**문서 상태**: ✅ Draft Complete
**검증 상태**: ⏳ POC 진행 중
**팀 승인**: ⏳ Pending
