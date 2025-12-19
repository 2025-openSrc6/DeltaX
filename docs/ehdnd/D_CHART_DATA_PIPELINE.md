# Chart 데이터 파이프라인 / avgVol(평균 변동성) 정리

이 문서는 PR#21(차트/정규화 강도/변동성 관련)에서 헷갈리기 쉬운 포인트를 **코드 기준**으로 정리합니다.

## 1) 차트 데이터는 언제/어디서 쌓이나?

### 1.1 저장(수집) 트리거

- **DB에 실제로 데이터를 쓰는 곳**: `POST /api/chart/collect` (`app/api/chart/collect/route.ts`)
- 이 엔드포인트는 **cron에 연결되어 있지 않습니다**(현재 `app/api/cron/scheduled/route.ts`는 rounds/recovery만 호출).
- 즉, 차트 데이터는 아래 중 하나가 돌아갈 때만 쌓입니다.
  - `useAutoCollect()` 훅이 실행되는 페이지를 누군가 열어둔 경우 (예: `app/chart-demo/page.tsx`)
  - 로컬에서 `scripts/collect-realtime.sh`를 실행 중인 경우
  - 누군가 직접 `POST /api/chart/collect`를 호출하는 경우

### 1.2 저장 주기(몇 초마다 쌓이나?)

- `useAutoCollect()` 기본 주기: **5초** (`hooks/useAutoCollect.ts`)
- `POST /api/chart/collect` 내부에는 **동일 자산에 대해 1초 이내 중복 수집을 스킵**하는 로직이 있습니다.
  - `oneSecondAgo` 이후 데이터가 있으면 skip (`app/api/chart/collect/route.ts`)
- 따라서 실질적으로:
  - 5초 주기로 돌리면: **자산당 5초에 1건**
  - 1초보다 촘촘히 돌려도: **자산당 최대 1초에 1건**(스킵으로 제한)

### 1.3 DB에 얼마나 쌓이나? (대략)

`POST /api/chart/collect` 1회 호출 시(스킵이 아니라면):

- `chart_data`에 **자산당 1행**
- `volatility_snapshots`에 **자산당 1행**
- TARGET_ASSETS가 `['PAXG','BTC']`라서 보통 한 번에 **각 테이블에 총 2행씩** 들어갑니다.

예) 5초마다 수집(차트 데모 페이지 기본)

- 분당 호출 12회 → 테이블당 24행/분
- 시간당 1440행/시간(테이블당)
- 하루 34560행/일(테이블당)
- 두 테이블 합산: 하루 69120행/일

※ 현재 **retention/cleanup 로직이 없어** 오래 켜두면 DB가 계속 커집니다.

---

## 2) 차트는 데이터를 언제 받아오고 언제 업데이트되나?

### 2.1 일반 가격/캔들 차트

- 조회 API: `GET /api/chart/historical` (`app/api/chart/historical/route.ts`)
- 프론트 훅: `useChartData()` (`hooks/useChartData.ts`)
  - 기본 `refreshInterval=60000` (1분)
  - 원하는 경우 5초/1초 등으로 더 자주 갱신 가능

### 2.2 정규화 강도 차트

- 조회 API: `GET /api/chart/normalized-strength` (`app/api/chart/normalized-strength/route.ts`)
- 프론트 컴포넌트: `components/charts/NormalizedStrengthChart.tsx`
  - 기본 `refreshInterval=10000` (10초)
  - `period`(1h/24h/7d)에 따라 DB에서 해당 구간의 `chart_data`를 조회
  - UI에는 `maxDataPoints`로 최근 N개만 표시(슬라이싱)

중요: **차트 업데이트 주기 = 프론트 refreshInterval**이고,
그 새 데이터가 보이려면 **그 사이에 DB에 새 `chart_data`가 쌓여야** 합니다.
(= 누군가 `POST /api/chart/collect`를 계속 호출하고 있어야 함)

---

## 3) 평균 변동성(avgVol)은 “언제” 계산되나?

현재 코드 기준으로는 2가지 의미의 “avgVol”이 섞여 있습니다.

### 3.1 `chart_data.averageVolatility` (수집 시점에 함께 저장)

- 계산 위치: `POST /api/chart/collect` (`app/api/chart/collect/route.ts`)
- 계산 방식:
  - 최근 DB 가격들을 최대 `HISTORY_PERIOD=500`개까지 읽고(`closePrices`)
  - `averageVolatility = calculateStdDev(closePrices)` (가격 레벨 stddev)

즉, 이것은 **"과거 30일"도 아니고 "수익률 stddev"도 아닙니다.**
(수집 간격이 5초면 500개는 약 41~42분 분량)

### 3.2 정규화 강도용 avgVol (요청 시점에 계산)

- 계산 위치: `GET /api/chart/normalized-strength`
- 계산 방식(의도):
  - DB에서 과거 30일치를 가져와서
  - `lib/services/normalizedStrength.ts`의 `calculateAverageVolatility()`로 계산

하지만 현재 구현에는 **시간 해상도/샘플링 전제 불일치**가 있습니다.

- API는 `past30Days` 조건을 걸지만, 동시에 `.limit(720)`을 걸고 있습니다.
  - 주석은 `30일 × 24시간`(= 1시간 바) 전제
- 실제 수집은 기본 5초라서,
  - 30일치가 아니라 **최근 720개(약 1시간)**만으로 계산될 가능성이 큽니다.

---

## 4) `calculateAverageVolatility()`를 쓰려면 어떤 데이터를 얼마나 모아야 하나?

파일: `lib/services/normalizedStrength.ts`

### 4.1 함수가 기대하는 입력의 “암묵적 전제”

- 함수는 내부에서 `days * 24`를 사용합니다.
- 즉 **"1시간 간격 데이터"(hourly close)**를 전제로 만든 형태입니다.
  - 30일이면 대략 720 포인트(시간당 1개)

### 4.2 필요한 데이터 개수(샘플링 간격별)

정확히 30일 평균을 의도한다면(단순화):

- 1일 1개(일봉 close): 약 30~31개
- 1시간 1개(시간봉 close): 약 30\*24=720개 (+1)
- 5초 1개(현재 데모 기본): 약 30*24*60\*12=518,400개 (+1)

### 4.3 지금 코드에 “그대로” 맞추려면

- `calculateAverageVolatility(prices, 30)`를 의미 있게 쓰려면
  - **입력 prices는 ‘1시간 간격으로 다운샘플된 close 배열’**이 되어야 합니다.
  - 혹은 chart 저장 자체를 1시간 캔들 단위로 바꿔야 합니다.

---

## 5) 지금 구조에서 생기는 혼란(핵심 원인)

- `chart_data`/`volatility_snapshots` 스키마 주석은 “1분 단위”인데, 데모 수집은 “5초 단위”입니다.
- 정규화 강도 API는 “30일\*24시간=720개”를 전제로 limit을 걸었는데,
  실제 데이터는 5초 단위라 limit 720이면 30일이 아니라 1시간 정도만 반영됩니다.
- `calculateAverageVolatility()`는 “수익률 stddev”인데,
  `chart_data.averageVolatility`는 “가격 레벨 stddev”라 의미가 다릅니다.
- 문서(`docs/ehdnd/sui/TODO.md`)에서는 `avgVol`을 정산 입력으로 쓰려면
  **cron finalize에서 내부 라이브러리를 직접 호출해 산출**하라고 되어 있는데,
  해당 파이프(수집→30일 보장→정산 입력)가 아직 고정되어 있지 않습니다.

---

## 6) (권장) 정산/룰에 쓰려면 어떻게 하는 게 맞나?

`docs/ehdnd/sui/TODO.md`의 방향처럼:

- 정산(돈/룰)에서 쓸 `avgVol`은 **정의 1개로 고정**
- finalize(크론)에서 D1을 조회해 `avgVol`을 계산 (HTTP로 `/api/chart/*` 호출 X)
- 데이터 부족/예외 시 fallback 정책을 정한다(최소 bar 수, 부족하면 정산 지연/취소/고정값 등)

---

## 7) 빠르게 확인하는 체크리스트

- “DB에 데이터가 쌓이고 있나?”
  - `GET /api/chart/collect`로 최신 데이터 확인
- “정규화 강도 차트가 안 나온다”
  - `chart_data`에 PAXG/BTC가 최소 1건씩 있어야 함
  - `GET /api/chart/normalized-strength?period=1h`로 확인
- “avgVol이 30일 기반이 맞나?”
  - 지금은 `limit(720)` 때문에 수집 주기에 따라 30일이 아닐 수 있음
