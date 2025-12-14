# Best Practice: Chart & Settlement Price Pipeline (DeltaX)

이 문서는 우리가 대화에서 합의한 **베스트 프랙티스 기준**으로,

- 무엇을 저장하고
- 라운드 시작/종료 가격과 avgVol을 어떻게 만들고
- 유저에게 차트를 어떤 방식으로 제공할지
  를 “계약(Contract) + 파이프라인(Flow)” 관점으로 한 번에 정리합니다.

핵심 메시지:

- **정산(돈/룰) 데이터와 차트(UX/인사이트) 데이터는 요구사항이 다르므로 분리**한다.
- 정산에 쓰는 canonical 데이터는 **캔들(1h)** 로 고정해 재현성을 확보한다.
- 실시간(5초)은 UX용이며, 굳이 DB에 무한 적재하지 않는다(저장하더라도 별도 tick/retention).

---

## 0) 용어/전제

- **tick**: 특정 시각의 순간 가격(예: lastPrice)
- **candle(캔들/봉)**: 일정 구간(예: 1m/1h)의 OHLCV 요약값
  - open/high/low/close/volume이 “구간 요약” 의미를 갖는다.
- **정산(승자 판정) 룰**: 여기서는 PR#21 맥락대로
  - “정규화 강도 = (현재 수익률 %) / (avgVol)” 기반 승자 판정(가정)
- **플랫폼 제약**: WebSocket은 쓰지 않음(Workers 환경/정책), 폴링 기반.

---

## 1) 차트에 뭘 저장할지 (1m klines 저장이 맞나?)

### 권장: `chart_data`는 1m klines(진짜 OHLCV)로 고정

- 소스: Binance `klines` API
- interval: `1m` (유저 차트 UX에 충분, 저장량도 감당 가능)
- 저장값: open/high/low/close/volume은 **klines 그대로** 저장

왜 1m가 베스트인가?

- 5초 tick을 DB에 저장하면 데이터량이 너무 커지고(retention 필수),
  정산/지표를 위한 “정의”가 혼란스러워진다.
- 1m는
  - 유저가 보기엔 충분히 실시간에 가깝고
  - 지표(표준편차/RSI/볼린저/ATR 등)를 계산하기에도 자연스러운 단위

### 대안(정말 실시간이 필요할 때): tick은 별도 경로/별도 저장

- tick은 "최신값" 성격이 강하므로
  - Redis(또는 KV)에 `latest_price:{asset}` 같은 키로 저장
  - TTL을 짧게(예: 60초) 두고 덮어쓰기
- tick을 DB에 저장해야 한다면
  - tick 전용 테이블을 분리하고
  - 보관기간(retention)을 매우 짧게 제한(예: 1~3일)

---

## 2) 라운드 시작/종료 스냅샷(startPrice/endPrice)은 어떻게?

### 목표: “정산 입력값의 재현성”

- 라운드마다 아래 값이 **DB에 기록되어야** 함
  - `PAXG_start, PAXG_end, BTC_start, BTC_end`
  - 각각의 **source/interval/used_timestamp** (감사 추적)

### 권장: start/end는 1m candle close로 고정

- 라운드 시작 시각 $T_{start}$, 종료 시각 $T_{end}$가 있을 때
  - startPrice = $T_{start}$에 가장 가까운 1m 캔들의 close(규칙은 고정)
  - endPrice = $T_{end}$에 가장 가까운 1m 캔들의 close(규칙은 고정)

규칙 예시(선택 후 고정 필요):

- **rule-1 (직전 완료 캔들)**: $T$ 직전에 close된 1m 캔들의 close
- **rule-2 (해당 분 캔들)**: $T$가 포함된 1m 캔들의 close

왜 1h가 아니라 1m?

- start/end는 “그 순간 가격”에 가까워야 하는데 1h는 너무 거칠 수 있음.
- 다만 팀이 단순화를 원하면 start/end도 1h로 고정할 수도 있지만,
  이 경우 “시각 정합성”에 대한 합의가 더 중요해짐.

---

## 3) 승자 판정(정규화 강도) = avgVol 때문에 1h 캔들이 필요

### avgVol 정의(정산 계약으로 고정)

- avgVol은 PR#21 정의를 canonical로 고정:
  - 입력: 과거 캔들 close 시계열
  - 처리: 인접 close로 수익률(%) 시퀀스를 만들고 그 표준편차(stddev)를 계산

### 권장: avgVol은 1h 캔들 30일(=720개) 기반

- 소스: Binance `klines(asset, '1h', 720)`
- 장점:
  - 데이터량이 작아 안정적
  - 노이즈가 적고 룰로 쓰기 적합
  - 재현/검증이 쉬움

### 구현 방식(베스트)

- finalize(정산) 시점에 서버가 1h klines를 직접 가져와 avgVol 계산
  - 차트 DB가 비어있거나 차트팀 파이프가 흔들려도 정산이 깨지지 않음

---

## 4) “1m 봉 저장”으로 바꾸면 기존 로직에서 뭐가 깨질까?

현재 `POST /api/chart/collect`는 ticker 기반으로 OHLC를 “추정”하는데,
이를 1m klines 기반으로 바꾸면 아래가 정리됩니다.

### 좋아지는 것(정합성)

- `open/high/low/close/volume`의 의미가 캔들 정의와 일치
- ATR/볼린저/MACD 같은 지표가 “캔들 기반”으로 일관됨

### 깨지거나 재검토가 필요한 것

- “5초마다 데이터가 하나씩 쌓인다” 전제였던 UI 문구/데모는 바뀜
  - 1m 캔들이면 데이터 포인트 증가 속도가 느려짐
- `volatility`, `averageVolatility`의 정의를 재정리해야 함
  - 정산용 avgVol(수익률 stddev)과
  - UI 인사이트용 변동성(가격 stddev)을 섞지 않도록

결론:

- 1m candle 저장으로 바꾸는 건 오히려 “깨지는 것”보다 “정상화되는 것”이 많음.
- 5초 tick 실시간은 별도 레이어로 분리하는 게 깔끔.

---

## 5) 총 저장하는 건 뭐뭐 있어야 하나? (권장 최소)

### A. 정산(필수)

- **Round price snapshots** (새 테이블 또는 rounds 컬럼)
  - start/end 가격 4개 + 사용한 캔들/timestamp 메타
- **Settlement meta**
  - avgVol 2개(PAXG/BTC)
  - avgVol 계산 파라미터: interval='1h', lookback=720, source='binance_klines'

### B. 차트(권장)

- `chart_data` (1m candles)
  - asset, timestamp(캔들 start or openTime), OHLCV
  - 필요하면 지표를 “캐시 칼럼”으로 추가(단, 정의/interval 고정)

### C. 선택(정말 실시간이 필요하면)

- Redis(KV) `latest_price:{asset}`
  - 값: price + serverTimestamp
  - TTL 짧게

---

## 6) 유저에게 차트는 어떻게 보여줄지 (WebSocket 없이)

아래 2안을 비교해서 선택하면 됩니다.

### 안 1) 변경 최소화(지금 구조 최대한 유지): DB를 사실상 캐시처럼 사용

- 서버가 일정 주기로 DB에 적재
- 프론트는 5~10초마다 `GET /api/chart/*`를 폴링

장점:

- 구현이 쉽고 구조가 단순

단점:

- DB 용량/retention/중복수집 문제가 바로 터짐
- tick과 candle의 정의가 섞이기 쉬움

권장 보완(변경 최소화라도 이건 필요):

- DB 적재는 1m candle만 (tick은 저장하지 않거나 별도)
- retention 정책 반드시 추가

### 안 2) Redis 활용(권장): 실시간은 Redis, 히스토리는 DB

- 서버(워커)가
  - 1m candle은 DB에 저장
  - 최신 tick/현재가는 Redis에 저장(TTL, overwrite)
- 프론트는
  - 차트(히스토리)는 DB 기반 API를 폴링(예: 10~30초)
  - 화면 상단 “현재가”만 Redis 기반 API를 5초 폴링

장점:

- 실시간 느낌은 유지하면서 DB를 보호
- 정산/차트/실시간 경계를 명확히 분리

프론트에서 “계산을 어디서 하냐” 기준(추천)

- **정산 관련 지표/값**: 서버에서 계산하고 저장(재현성)
- **UI 인사이트 지표**(가벼운 것):
  - 서버에서 계산해 내려줘도 되고
  - 클라에서 계산해도 되지만(=표시용), 정산 값과 혼동되면 안 됨

---

## 7) 현준(차트 담당)에게 던질 질문/결정 포인트

"tick과 candle을 분리해라"라고 요구하기보다,
아래 **결정 5개**만 확정해달라고 요청하는 게 대화가 빨라집니다.

1. `chart_data`는 앞으로 **tick 저장**인가요, **1m candle 저장**인가요?
2. candle 저장이면 `open/high/low/close/volume`은 Binance klines의 **진짜 OHLCV**로 채우나요?
3. 실시간(5초)은 DB에 저장할 건가요, Redis(최신값)로 갈 건가요?
4. 정산 avgVol은 **1h 720개**로 고정해도 되나요? (정산 계약)
5. retention(보관기간) 정책은? (1m candle 30일/60일 등)

---

## 8) 결론(추천안 요약)

- **정산(룰)**: finalize 시점에 Binance `1h klines(720)`로 avgVol 계산 + start/end 스냅샷 저장
- **차트(히스토리)**: DB에는 `1m klines`만 저장(진짜 OHLCV)
- **실시간(현재가)**: Redis 최신값 + 클라 5초 폴링 (WebSocket 없이도 충분)

이 구조면

- 유저는 모두 동일한 기준의 차트를 보고
- 정산 입력값은 재현 가능하며
- DB 용량/중복수집 문제를 통제할 수 있습니다.
