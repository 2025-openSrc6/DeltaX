# Chart 파이프라인 — 애매한 부분 / 결정 필요 사항

이 문서는 현재 레포 코드 기준으로,

- "지금 무엇을 저장하고 있는지"
- "tick(실시간)과 candle(봉/캔들)이 어떻게 다른지"
- "Sui 정산에 필요한 값을 지금 구조로 뽑을 수 있는지"
- "차트팀에 무엇을 물어봐야 하는지"
  를 한 번에 정리합니다.

---

## 1) 지금 저장된 데이터는 뭘 저장하는 거지?

### 1.1 실제 저장 테이블

- `chart_data`에 저장됨: `POST /api/chart/collect` → `db.insert(chartData)`
- `volatility_snapshots`에 저장됨: `POST /api/chart/collect` → `db.insert(volatilitySnapshots)`

### 1.2 `chart_data`가 지금 담는 “실제 의미”(중요)

현재 구현은 Binance의 **진짜 캔들(OHLCV)**를 저장하는 게 아니라,

- `fetchCurrentPrice(asset)`로 가져온 `lastPrice`(현재가) 1개를 중심으로
- `open/high/low`를 "이전 close와 현재 price"로 **추정**해서 채우는 형태입니다.
- `volume`도 캔들 구간 거래량이 아니라 Binance `ticker/24hr`의 **24시간 누적 볼륨**입니다.

결론적으로 지금 `chart_data`는:

- tick(순간 가격) 시계열에 가깝고
- OHLCV는 “시각화/지표계산을 위한 임시 추정치”에 가깝습니다.

### 1.3 `volatility_snapshots`의 현재 상태

- 적재는 되지만(매 collect마다), 현재 레포에서 **조회/소비하는 API/컴포넌트가 확인되지 않습니다**.
- 따라서 운영 관점에서 "DB에 많이 쌓이기만 하는 상태"입니다.

---

## 2) 지금은 `chart_data` 하나로만 저장하는 거야?

"가격 계열"은 실질적으로 `chart_data` 한 테이블로 쌓입니다.

- 다만 `volatility_snapshots`라는 "파생지표 캐시 테이블"도 동시에 쌓이고 있음(사용처는 불명확).

정리:

- 원시(처럼 쓰는) 데이터: `chart_data`
- 파생지표 캐시(라고 의도된 듯): `volatility_snapshots`

---

## 3) 5초 tick 저장 파이프라인이 있다고 가정하면, Sui 정산값을 뽑을 수 있어?

정산에 필요한 값이 보통 아래 2종류로 나뉩니다.

### 3.1 시작가/종가(시가/종가) — tick만 있어도 “가능”

- 라운드 시작/종료 시각 주변의 tick 중
  - 가장 가까운 값(또는 ±허용오차 내 첫 값)을 쓰면 됩니다.
- 다만 **재현성/감사추적**을 위해
  - “어떤 timestamp의 어떤 tick을 사용했는지”를 정산 테이블에 저장하는 게 좋습니다.

### 3.2 avgVol(평소 변동성, 30일) — tick만으로는 “비추/고비용”

- PR#21의 avgVol 정의(수익률 stddev)를 30일 tick으로 하려면 데이터가 너무 많아집니다.
  - 5초 tick 기준 30일은 약 518,400 포인트(자산당)로 커집니다.
- 운영/정산 관점에서는 보통
  - 1시간봉(720개) 또는 1분봉을 1시간으로 다운샘플한 값 기반으로 avgVol을 계산합니다.

결론:

- tick만으로도 시작/종가는 뽑을 수 있음
- avgVol은 **별도의 candle 데이터(1h/1m klines)**가 필요하다고 보는 게 안전

---

## 4) tick이랑 봉이 다른 거야? 지금은 뭘 저장한다는 거지?

### 4.1 tick vs candle 요약

- tick: (시간 t) 가격 1개
- candle(봉): (구간 [t, t+1h])의 요약값
  - open=구간 첫 거래가격
  - high/low=구간 내 최고/최저
  - close=구간 마지막 거래가격
  - volume=구간 거래량

### 4.2 지금 저장 방식은 “tick 기반 + candle 흉내”

현재 `collect`는 진짜 candle을 가져오지 않기 때문에:

- open/high/low/volume을 candle 의미로 쓰면 위험합니다.
- 저장된 지표(`volatility`, `averageVolatility`, `rsi` 등)도
  - “어떤 간격의 가격 배열로 계산했는지”가 명시되지 않으면 정산/계약값으로 쓰기 어렵습니다.

---

## 5) 차트팀(혹은 담당자)에게 뭐라고 물어봐야 하나?

아래 질문들은 **"tick vs candle 분리"를 요구하는 게 아니라**,
"어느 데이터를 canonical(정산/지표)로 삼을지"를 결정하기 위한 질문입니다.

### 5.1 저장 데이터 계약(가장 중요)

1. `chart_data`는 tick 저장 테이블인가요, candle(예: 1m) 저장 테이블인가요?
2. candle을 저장하는 게 목표라면, Binance `klines`를 써서 **진짜 OHLCV**로 채울 계획인가요?
3. `volume`은 무엇을 의미해야 하나요? (캔들 거래량 vs 24h 누적)

### 5.2 수집 파이프라인(운영)

4. 서버에서 지속 수집은 누가/어떻게 보장하나요? (cron/worker/별도 수집기)
5. 수집 주기는 무엇이 목표인가요?
   - 실시간 UX용(5초)과, 정산/지표용(1m/1h)을 분리할 건가요?

### 5.3 avgVol 정의 확정(정산 계약)

6. avgVol은 30일 기준으로 어떤 간격을 canonical로 하나요?
   - 1h(720개) / 1m(다운샘플) / tick
7. 데이터 부족 시 정책은 무엇인가요? (최소 bar 수, 부족 시 정산 지연/취소/고정값)

### 5.4 `volatility_snapshots` 테이블

8. `volatility_snapshots`는 어디에서 조회/사용 예정인가요?
9. 사용 계획이 없다면 적재 중단/삭제(또는 보관기간/retention) 합의가 가능한가요?

---

## 빠른 결론(실행 우선순위)

- 정산(Sui finalize)에 쓰려면: "시작/종가 스냅샷" + "avgVol 계산 방식"을 먼저 확정해야 합니다.
- 차트 실시간 UX(5초)는 별개로 가져가도 되지만, 정산 계약값은 candle 기반(1h/1m)로 고정하는 게 안전합니다.
