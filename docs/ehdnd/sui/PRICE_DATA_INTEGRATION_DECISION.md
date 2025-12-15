## 가격 데이터 연동 의사결정 (CHART_TEAM_REQUEST 머지 후 작업 가이드) — 2025-12-15

이 문서는 현준 PR(`docs/ehdnd/CHART_TEAM_REQUEST.md`)이 머지된 이후,
태웅이 **어디를 수정하고 어디까지 대체할지**를 결정/기록한다.

---

## 0) 현재 상태(코드 기준)

- Job2 `/api/cron/rounds/open`은 start price를 **mock**으로 만들고 `RoundService.openRound(prices)`에 전달한다.
- Job4 `/api/cron/rounds/finalize`는 end price를 **mock**으로 만들고 `RoundService.finalizeRound(endPriceData)`에 전달한다.
- `RoundService`는 `PriceData.meta`를 받아 DB의 `rounds.priceSnapshotMeta`에 저장/병합하는 구조가 이미 있다.

---

## 1) 의사결정: “정산 입력 가격”은 tick이 아니라 1m kline close를 쓴다

### 이유

- tick 가격은 재현이 어려움(“어느 시점/어느 캔들의 값인지” 검증이 어려움)
- 1m kline close는 “이 값은 어떤 캔들의 close인지”를 **메타데이터로 고정**할 수 있어 검증 가능

### 적용

- 라운드 오픈(start) / 라운드 종료(end) 가격은 `fetchRoundSnapshotKline1m()`로 캡처한다.
- tick 가격(`fetchTickPrice`)은 **차트 UX(5초 폴링)** 용도에만 사용한다.

---

## 2) 머지 후 태웅이 수정할 파일(확정)

### 2.1 Job2: `app/api/cron/rounds/open/route.ts`

- 교체 대상: 현재 mock `prices: PriceData`
- 교체 후:
  - `fetchRoundSnapshotKline1m('PAXG')`, `fetchRoundSnapshotKline1m('BTC')` 호출
  - `PriceData` 구성:
    - `gold/btc`: 각 close
    - `timestamp`: 각 closeTimeMs 중 “대표 timestamp” (권장: max(closeTimeMs))
    - `source`: `'binance_klines_1m'` 같은 명확한 값
    - `meta`: `{ kind:'start', paxg:{...onchainMeta}, btc:{...onchainMeta} }`
  - `registry.roundService.openRound(prices)` 호출

### 2.2 Job4: `app/api/cron/rounds/finalize/route.ts`

- 교체 대상: 현재 mock `endPriceData: PriceData`
- 교체 후:
  - `fetchRoundSnapshotKline1m('PAXG')`, `fetchRoundSnapshotKline1m('BTC')` 호출
  - `PriceData` 구성:
    - `gold/btc`: 각 close
    - `timestamp`: 각 closeTimeMs 중 대표 timestamp
    - `source`: `'binance_klines_1m'`
    - `meta`: `{ kind:'end', paxg:{...onchainMeta}, btc:{...onchainMeta} }`
  - `registry.roundService.finalizeRound(endPriceData)` 호출

---

## 3) 대체 범위(어디까지 바꾸나?) — 1차/2차로 나눔

### 3.1 1차(머지 직후 바로 할 것, 최소 변경)

- Job2/Job4에서 mock 가격 제거 → 1m kline 기반으로 start/end 가격+meta 주입
- `RoundService`의 저장 로직은 그대로 활용

### 3.2 2차(선택, 검증/감사 강화)

avgVol은 현재 `fetchKlines()`로 1h 720개를 가져오지만, “fetch 메타(범위/심볼/인터벌)”가 고정되지 않는다.

- 선택지 A(권장): `fetchAvgVolKlines1h720()`로 교체해
  - `avgVolMeta`에 **fetch meta + 계산 meta(methodVersion/window)**를 함께 저장
- 선택지 B(현상 유지): avgVol은 지금처럼 fetchKlines 기반으로 유지하고, 당장 제품 시연을 우선

> 이번 마일스톤에서 “온체인 검증 가능성”을 강하게 보여주려면 A가 더 좋다.

---

## 4) 문서/스펙 반영 위치

- 진행 상태/체크리스트: `docs/ehdnd/sui/TODO_UPDATED.md`
- Sui-first/cron 흐름: `docs/ehdnd/sui/CRON_FLOW_AND_CLAIM_MODEL.md`


