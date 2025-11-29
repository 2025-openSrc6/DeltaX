# Chart Schema - TypeScript 타입 가이드

**작성자**: 김현준  
**작성일**: 2025-01-XX  
**목적**: 차트 모듈 스키마 파일의 TypeScript 타입 및 사용법 설명

---

## 📁 파일 구조

```
db/schema/
├── chartData.ts              ← 차트 가격 데이터 테이블
├── volatilitySnapshots.ts    ← 변동성 지표 스냅샷 테이블
└── index.ts                  ← 모든 스키마 export
```

---

## 1️⃣ `db/schema/chartData.ts`

### 목적

- OHLCV(Open, High, Low, Close, Volume) 캔들스틱 데이터 저장
- 기술적 지표 (RSI, 변동성) 계산값 캐싱
- 실시간 가격 데이터를 1분 단위로 저장

### 주요 타입

#### `chartData` (테이블 정의)

```typescript
export const chartData = sqliteTable(
  'chart_data',
  {
    // 필드 정의...
  },
  (table) => ({
    // 인덱스 정의...
  }),
);
```

**타입**: `SqliteTable` (Drizzle ORM)

#### `ChartData` (SELECT 타입)

```typescript
export type ChartData = typeof chartData.$inferSelect;
```

**설명**: 데이터베이스에서 조회한 데이터의 타입입니다.

**사용 예시**:

```typescript
import { chartData, type ChartData } from '@/db/schema';

// 쿼리 결과는 ChartData 타입
const result: ChartData[] = await db.select().from(chartData).where(eq(chartData.asset, 'BTC'));

// ChartData 타입 구조
// {
//   id: string;
//   asset: string;
//   timestamp: Date;
//   open: number;
//   high: number;
//   low: number;
//   close: number;
//   volume: number;
//   volatility: number | null;
//   rsi: number | null;
//   createdAt: Date;
//   updatedAt: Date;
// }
```

#### `NewChartData` (INSERT 타입)

```typescript
export type NewChartData = typeof chartData.$inferInsert;
```

**설명**: 데이터베이스에 삽입할 데이터의 타입입니다. `id`, `createdAt`, `updatedAt`는 선택적입니다 (자동 생성).

**사용 예시**:

```typescript
import { chartData, type NewChartData } from '@/db/schema';

// 새 데이터 생성 (id는 자동 생성)
const newData: NewChartData = {
  asset: 'BTC',
  timestamp: new Date(),
  open: 45000,
  high: 45200,
  low: 44800,
  close: 45100,
  volume: 1250000,
  // volatility, rsi는 선택사항
};

// DB에 삽입
await db.insert(chartData).values(newData);
```

### 필드 상세 설명

| 필드         | 타입             | 설명                         | 제약조건                 |
| ------------ | ---------------- | ---------------------------- | ------------------------ |
| `id`         | `string`         | 고유 식별자 (UUID)           | PK, 자동 생성            |
| `asset`      | `string`         | 자산 심볼 ('BTC', 'PAXG' 등) | NOT NULL, 최대 10자      |
| `timestamp`  | `Date`           | 캔들 시작 시간               | NOT NULL, Unix timestamp |
| `open`       | `number`         | 시가                         | NOT NULL                 |
| `high`       | `number`         | 고가                         | NOT NULL                 |
| `low`        | `number`         | 저가                         | NOT NULL                 |
| `close`      | `number`         | 종가                         | NOT NULL                 |
| `volume`     | `number`         | 거래량                       | NOT NULL, 기본값 0       |
| `volatility` | `number \| null` | 변동성 (표준편차)            | NULL 허용                |
| `rsi`        | `number \| null` | RSI 지표 (0-100)             | NULL 허용                |
| `createdAt`  | `Date`           | 레코드 생성 시각             | NOT NULL, 자동 생성      |
| `updatedAt`  | `Date`           | 레코드 업데이트 시각         | NOT NULL, 자동 생성      |

### 인덱스

1. **복합 인덱스**: `(asset, timestamp)`
   - 목적: 특정 자산의 시간대별 조회 최적화
   - 쿼리 예: `WHERE asset = 'BTC' AND timestamp >= ?`

2. **UNIQUE 제약**: `(asset, timestamp)`
   - 목적: 동일 자산의 동일 시간대 데이터 중복 방지

3. **타임스탬프 인덱스**: `(timestamp)`
   - 목적: 시간 범위 조회 최적화

### 실제 사용 예시

```typescript
import { getDbFromContext } from '@/lib/db';
import { chartData, type NewChartData } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

// 1. 데이터 삽입
export async function saveChartData(context: NextContext, data: NewChartData) {
  const db = getDbFromContext(context);
  await db.insert(chartData).values(data);
}

// 2. 특정 자산의 최근 데이터 조회
export async function getLatestChartData(context: NextContext, asset: string, limit: number = 100) {
  const db = getDbFromContext(context);
  return await db
    .select()
    .from(chartData)
    .where(eq(chartData.asset, asset))
    .orderBy(desc(chartData.timestamp))
    .limit(limit);
}

// 3. 시간 범위별 데이터 조회
export async function getChartDataByRange(
  context: NextContext,
  asset: string,
  startTime: Date,
  endTime: Date,
) {
  const db = getDbFromContext(context);
  return await db
    .select()
    .from(chartData)
    .where(
      and(
        eq(chartData.asset, asset),
        gte(chartData.timestamp, startTime),
        lte(chartData.timestamp, endTime),
      ),
    )
    .orderBy(chartData.timestamp);
}

// 4. 최신 가격 업데이트 (upsert)
export async function upsertChartData(context: NextContext, data: NewChartData) {
  const db = getDbFromContext(context);
  await db
    .insert(chartData)
    .values(data)
    .onConflictDoUpdate({
      target: [chartData.asset, chartData.timestamp],
      set: {
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume,
        updatedAt: new Date(),
      },
    });
}
```

---

## 2️⃣ `db/schema/volatilitySnapshots.ts`

### 목적

- 변동성 지표의 스냅샷 저장
- 복잡한 계산 결과를 캐싱하여 API 응답 속도 향상
- 매 1분마다 업데이트 또는 배치 계산

### 주요 타입

#### `volatilitySnapshots` (테이블 정의)

```typescript
export const volatilitySnapshots = sqliteTable(
  'volatility_snapshots',
  {
    // 필드 정의...
  },
  (table) => ({
    // 인덱스 정의...
  }),
);
```

#### `VolatilitySnapshot` (SELECT 타입)

```typescript
export type VolatilitySnapshot = typeof volatilitySnapshots.$inferSelect;
```

**타입 구조**:

```typescript
{
  id: string;
  asset: string;
  timestamp: Date;
  stdDev: number; // 표준편차 (필수)
  percentChange: number; // 변동률 (%) (필수)
  atr: number | null; // Average True Range
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerBandwidth: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  createdAt: Date;
}
```

#### `NewVolatilitySnapshot` (INSERT 타입)

```typescript
export type NewVolatilitySnapshot = typeof volatilitySnapshots.$inferInsert;
```

**사용 예시**:

```typescript
import { volatilitySnapshots, type NewVolatilitySnapshot } from '@/db/schema';

const snapshot: NewVolatilitySnapshot = {
  asset: 'BTC',
  timestamp: new Date(),
  stdDev: 250.75, // 필수
  percentChange: 2.5, // 필수
  atr: 180.5, // 선택
  // 나머지 필드는 선택사항
};

await db.insert(volatilitySnapshots).values(snapshot);
```

### 필드 상세 설명

| 필드                 | 타입             | 설명                   | 제약조건              |
| -------------------- | ---------------- | ---------------------- | --------------------- |
| `id`                 | `string`         | 고유 식별자 (UUID)     | PK, 자동 생성         |
| `asset`              | `string`         | 자산 심볼              | NOT NULL, 최대 10자   |
| `timestamp`          | `Date`           | 스냅샷 시간            | NOT NULL              |
| `stdDev`             | `number`         | 표준편차               | NOT NULL, > 0         |
| `percentChange`      | `number`         | 변동률 (%)             | NOT NULL, -100 ~ +100 |
| `atr`                | `number \| null` | Average True Range     | NULL 허용             |
| `bollingerUpper`     | `number \| null` | 볼린저 밴드 상단       | NULL 허용             |
| `bollingerMiddle`    | `number \| null` | 볼린저 밴드 중간 (SMA) | NULL 허용             |
| `bollingerLower`     | `number \| null` | 볼린저 밴드 하단       | NULL 허용             |
| `bollingerBandwidth` | `number \| null` | 볼린저 밴드폭 (%)      | NULL 허용             |
| `macd`               | `number \| null` | MACD 라인              | NULL 허용             |
| `macdSignal`         | `number \| null` | MACD Signal 라인       | NULL 허용             |
| `macdHistogram`      | `number \| null` | MACD Histogram         | NULL 허용             |
| `createdAt`          | `Date`           | 레코드 생성 시각       | NOT NULL, 자동 생성   |

### 실제 사용 예시

```typescript
import { getDbFromContext } from '@/lib/db';
import { volatilitySnapshots, type NewVolatilitySnapshot } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

// 1. 변동성 스냅샷 저장
export async function saveVolatilitySnapshot(
  context: NextContext,
  snapshot: NewVolatilitySnapshot,
) {
  const db = getDbFromContext(context);
  await db.insert(volatilitySnapshots).values(snapshot);
}

// 2. 최신 변동성 지표 조회
export async function getLatestVolatility(
  context: NextContext,
  asset: string,
): Promise<VolatilitySnapshot | null> {
  const db = getDbFromContext(context);
  const result = await db
    .select()
    .from(volatilitySnapshots)
    .where(eq(volatilitySnapshots.asset, asset))
    .orderBy(desc(volatilitySnapshots.timestamp))
    .limit(1);

  return result[0] || null;
}

// 3. 변동성 스냅샷 업데이트 (upsert)
export async function upsertVolatilitySnapshot(
  context: NextContext,
  snapshot: NewVolatilitySnapshot,
) {
  const db = getDbFromContext(context);
  await db
    .insert(volatilitySnapshots)
    .values(snapshot)
    .onConflictDoUpdate({
      target: [volatilitySnapshots.asset, volatilitySnapshots.timestamp],
      set: {
        stdDev: snapshot.stdDev,
        percentChange: snapshot.percentChange,
        atr: snapshot.atr,
        bollingerUpper: snapshot.bollingerUpper,
        bollingerMiddle: snapshot.bollingerMiddle,
        bollingerLower: snapshot.bollingerLower,
      },
    });
}
```

---

## 3️⃣ `db/schema/index.ts`

### 목적

- 모든 스키마를 한 곳에서 export
- 다른 파일에서 쉽게 import 가능

### 구조

```typescript
// 기존 스키마
export * from './users';
export * from './rounds';
export * from './bets';
// ... 기타

// 차트 모듈 스키마 (새로 추가)
export * from './chartData';
export * from './volatilitySnapshots';
```

### 사용 방법

```typescript
// 모든 스키마 한 번에 import
import {
  chartData,
  volatilitySnapshots,
  type ChartData,
  type NewChartData,
  type VolatilitySnapshot,
  type NewVolatilitySnapshot,
  // 기타 테이블들도 사용 가능
  users,
  bets,
} from '@/db/schema';

// 또는 개별 import
import { chartData } from '@/db/schema/chartData';
import { volatilitySnapshots } from '@/db/schema/volatilitySnapshots';
```

---

## 🔗 타입 간 관계

### ChartData ↔ VolatilitySnapshot

두 테이블은 **asset**과 **timestamp**로 연결됩니다:

- `chartData.asset` = `volatilitySnapshots.asset`
- `chartData.timestamp` = `volatilitySnapshots.timestamp`

**사용 예시**:

```typescript
// 차트 데이터와 변동성 스냅샷을 함께 조회
const chartDataResult = await db
  .select()
  .from(chartData)
  .where(eq(chartData.asset, 'BTC'))
  .orderBy(desc(chartData.timestamp))
  .limit(1);

if (chartDataResult.length > 0) {
  const data = chartDataResult[0];

  // 같은 asset, timestamp의 변동성 스냅샷 조회
  const volatility = await db
    .select()
    .from(volatilitySnapshots)
    .where(
      and(
        eq(volatilitySnapshots.asset, data.asset),
        eq(volatilitySnapshots.timestamp, data.timestamp),
      ),
    )
    .limit(1);
}
```

---

## 💡 주요 사용 패턴

### 1. 데이터 삽입 (INSERT)

```typescript
// 단일 레코드
const newChartData: NewChartData = {
  asset: 'BTC',
  timestamp: new Date(),
  open: 45000,
  high: 45200,
  low: 44800,
  close: 45100,
  volume: 1250000,
};

await db.insert(chartData).values(newChartData);

// 여러 레코드 한 번에
const multipleData: NewChartData[] = [
  {
    asset: 'BTC',
    timestamp: new Date(),
    open: 45000,
    high: 45200,
    low: 44800,
    close: 45100,
    volume: 1250000,
  },
  {
    asset: 'PAXG',
    timestamp: new Date(),
    open: 2650,
    high: 2655,
    low: 2648,
    close: 2652,
    volume: 125000,
  },
];

await db.insert(chartData).values(multipleData);
```

### 2. 데이터 조회 (SELECT)

```typescript
// 모든 데이터
const all = await db.select().from(chartData);

// 조건부 조회
const btcData = await db.select().from(chartData).where(eq(chartData.asset, 'BTC'));

// 정렬 및 제한
const latest = await db
  .select()
  .from(chartData)
  .where(eq(chartData.asset, 'BTC'))
  .orderBy(desc(chartData.timestamp))
  .limit(10);
```

### 3. 데이터 업데이트 (UPDATE)

```typescript
await db
  .update(chartData)
  .set({
    close: 45200,
    updatedAt: new Date(),
  })
  .where(and(eq(chartData.asset, 'BTC'), eq(chartData.timestamp, specificTimestamp)));
```

### 4. Upsert (INSERT OR UPDATE)

```typescript
await db
  .insert(chartData)
  .values(newData)
  .onConflictDoUpdate({
    target: [chartData.asset, chartData.timestamp],
    set: {
      open: newData.open,
      high: newData.high,
      low: newData.low,
      close: newData.close,
      volume: newData.volume,
      updatedAt: new Date(),
    },
  });
```

### 5. 데이터 삭제 (DELETE)

```typescript
// 특정 조건 삭제
await db.delete(chartData).where(and(eq(chartData.asset, 'BTC'), lt(chartData.timestamp, oldDate)));

// 오래된 데이터 정리 (예: 90일 이상)
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

await db.delete(chartData).where(lt(chartData.timestamp, ninetyDaysAgo));
```

---

## ⚠️ 주의사항

### 1. 타임스탬프 정규화

- `timestamp`는 1분 단위로 정규화하여 저장
- 예: `2025-01-15 14:23:45` → `2025-01-15 14:23:00`

### 2. UNIQUE 제약

- `(asset, timestamp)` 조합은 유일해야 함
- 중복 삽입 시 에러 발생 → `onConflictDoUpdate` 사용 권장

### 3. NULL 값 처리

- `volatility`, `rsi` 등은 NULL 허용
- 조회 시 `data.volatility ?? 0` 같은 방식으로 처리

### 4. 타입 안정성

- `$inferSelect`, `$inferInsert` 사용으로 자동 타입 추론
- 타입 변경 시 TypeScript 컴파일 에러로 미리 감지 가능

---

## 📚 참고 자료

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [SQLite Data Types](https://www.sqlite.org/datatype3.html)
- [TypeScript Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)

---

**작성 완료**: 2025-01-XX  
**질문이나 수정사항이 있으면 언제든 알려주세요!** 🚀
