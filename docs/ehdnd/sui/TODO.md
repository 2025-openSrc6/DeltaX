2025.12.15 (Updated)

### DeltaX 마감(2일) 플랜 — 온체인 유지(DEL 포인트) + 투명 정산 노출

> **Last Updated**: 2025-12-15  
> **Status**: 코드베이스 재분석 완료, TODO 항목 업데이트

## 0) 목표/스코프(이번 마일스톤)

- **Goal**: “베팅/정산이 Sui 온체인에 기록되고 누구나 검증 가능”을 **실제로 보여주는 데모/프로덕트** 완성
- **In-scope**
  - 온체인: 베팅 풀 생성 → 베팅 → 락 → 정산(승자/배당률/수수료/가격) → 배당 전송(개별 Bet 소각 포함)
  - 오프체인: Cron이 위 온체인 함수를 호출 + 가격 입력 파이프(시가/종가) + `avgVol`(평소 변동성) 산출 + 출석 보상 민팅
  - 프론트: 라운드별 “온체인 정산 영수증(Settlement)” 뷰/링크/값 표시
- **Out-of-scope(이번엔 미룸)**
  - (미룸) 온체인이 시계열(30일)을 직접 받아 `avgVol`을 계산하는 방식
  - (미룸) 오라클 기반 가격/변동성 공급(완전 온체인)
  - (미룸) 멀티시그/오라클(시간되면 추후)

---

## 0.1) 현재 구현/정의 상태 (레포 직접 확인 결과, 2025-12-14)

> 표기: `[DONE]` 구현/정의 완료, `[PARTIAL] 일부만 있음/불일치`, `[TODO] 미구현/미정`, `[DECISION] 결정 필요`

### 온체인(Sui Move)

- `[DONE]` **베팅/풀/정산/배당 Move 로직 존재**
  - `contracts/sources/betting.move`: `create_pool`, `place_bet`, `lock_pool`, `finalize_round`, `distribute_payout`
  - `contracts/tests/betting_tests.move`: e2e 포함 테스트 다수 존재
- `[DONE]` **시간 단위는 ms**
  - `betting.move`에서 `clock::timestamp_ms` 사용, `lock_time/end_time` 주석도 ms
- `[PARTIAL]` **현재 승자 산식은 “절대 변동(방향 무시) 기반”**
  - `betting.move`: `abs(price_end - price_start)` 기반
  - 이번 마감은 정산 룰을 “정규화 강도(수익률/avgVol)”로 진행하기로 했으므로, 온체인 finalize 로직 교체가 필요함(아래 1.1)
- `[PARTIAL]` **상태머신은 OPEN → LOCKED → SETTLED (취소/무효 없음)**

### 오프체인(Next.js / D1)

- `[DONE]` **온체인 “베팅(place_bet)” 준비/실행 플로우는 서버 API로 구현됨**
  - `POST /api/bets`: DB에 pending bet 생성 + `txBytes/nonce/expiresAt` 발급
    - `app/api/bets/route.ts`, `lib/bets/service.ts`, `lib/sui/service.ts`
  - `POST /api/bets/execute`: 유저 서명 + 스폰서 서명으로 체인 실행 후 `bets.suiTxHash` 업데이트
    - `app/api/bets/execute/route.ts`, `lib/bets/service.ts`, `lib/sui/service.ts`
  - 참고: `docs/ehdnd/sui/SUI_INTEGRATION_COOKBOOK.md`는 `/api/sui/...` 경로 예시가 있으나, 현재 실제 구현 경로는 `/api/bets*`임
- `[PARTIAL]` **라운드 크론(Job 1~6)은 구현되어 있으나 “온체인 풀/정산/배당 호출”은 아직 없음**
  - 크론 라우트 존재: `app/api/cron/rounds/{create,open,lock,finalize,settle}/route.ts`, `app/api/cron/recovery/route.ts`
  - 스케줄 오케스트레이터: `app/api/cron/scheduled/route.ts`
  - 현재 `RoundService`는 DB 기준으로 승자/배당 계산 + bet 정산 상태 업데이트만 수행 (온체인 `lock_pool/finalize_round/distribute_payout` 호출 없음)
    - `lib/rounds/service.ts`
- `[PARTIAL]` **정산 계산 기준이 온체인/오프체인에서 분리되어 있음(정리 필요)**
  - 현재 오프체인 `RoundService`는 DB 기준 winner/payout을 계산하지만(부호 포함 변동률), 이건 “임시/현재 구현”
  - 목표 상태: **정산 승자/배당은 온체인 Settlement 값을 소스로 삼고**, D1에는 “온체인 정산 영수증(가격/avgVol/메타/tx)”를 저장/노출
- `[PARTIAL]` **가격 스냅샷 파이프 일부 구현**
  - 가격 API 존재: `GET /api/price/snapshot` (`app/api/price/snapshot/route.ts`) — Binance 기반, 실패 시 fallback
  - 하지만 크론 open/finalize는 현재 mock price 사용 중
    - `app/api/cron/rounds/open/route.ts`, `app/api/cron/rounds/finalize/route.ts`
  - DB 스키마는 가격 스냅샷/라운드 필드 준비되어 있음
    - `db/schema/priceSnapshots.ts`, `db/schema/rounds.ts`
- `[DONE]` **차트 도메인에 “정규화 강도(수익률/avgVol)” 계산 로직이 이미 구현됨 (정산 룰로 채택)**
  - `lib/services/normalizedStrength.ts`: `calculateAverageVolatility`는 “수익률(%) 시퀀스 stddev”로 `avgVol` 계산
  - `GET /api/chart/normalized-strength`: 현재는 차트/인사이트용으로 계산해 반환
- `[INFO]` **차트 분석용 `/api/chart/compare`는 별도 지표(Volatility-Adjusted Return)**
  - 사용처: 차트 페이지(`app/chart/page.tsx`)
  - 내부 `volatility`는 price stddev 기반이라, 정산 스펙의 `avgVol`(수익률 stddev)과 정의가 다름
  - 결론: `/api/chart/compare`는 “UI 인사이트용 보조 지표”로 유지하고, 정산 규칙과 혼동되지 않게 분리
- `[TODO]` **온체인 풀 생성/잠금/정산/배당을 호출하는 Sui 래퍼(Repository 레벨) 없음**
  - 현재 `lib/sui/`는 `place_bet` 중심(빌더 + prepare/execute)만 구현됨
  - `SUI_CAP_OBJECT_ID` 환경변수는 정의돼 있으나 실제 사용처 확인되지 않음
    - `lib/env.ts`
- `[TODO]` **출석 보상(DEL 민팅) 관련 API/서비스/테이블 연결 미확인(현재 미구현으로 판단)**
  - `app/api`에서 attendance/reward 관련 엔드포인트 확인되지 않음 (2025-12-14 기준)

---

## 1) Contracts(Sui Move)에서 점검/수정할 것

### 1.1 승자 판정 산식 확정(단순화)

- `[DECISION → DONE]` **정산 승자 규칙: 정규화 강도(Normalized Strength)로 진행**
  - 정규화 강도 = 수익률(%) / 평소 변동성 `avgVol`(%) _(PR#21 정의)_
  - 온체인은 시계열(30일)을 직접 계산하지 않고, 백엔드가 계산한 `avgVol`을 입력으로 받는 현실적 타협안
  - 핵심은 “룰/윈도우/샘플링/소스/버전”을 **메타데이터로 온체인 Settlement에 같이 기록**해 임의 변경/논쟁을 줄이는 것
- **필요 작업**
  - `[TODO]` `contracts/sources/betting.move`의 `finalize_round`를 정규화 강도 규칙으로 교체/확장
    - 입력값(필수): `gold_start`, `gold_end`, `btc_start`, `btc_end`, `gold_avg_vol`, `btc_avg_vol`
    - 비교식(나눗셈 제거, 동점 GOLD):
      - `abs(gΔ) * btc_start * btc_avg_vol >= abs(bΔ) * gold_start * gold_avg_vol` → GOLD 승
    - Settlement에 `avgVol` + 메타데이터도 기록하도록 구조 확장(아래 “메타데이터” 참고)
  - `[TODO]` 정규화 강도 기반 finalize 테스트 케이스 추가/수정
    - `contracts/tests/betting_tests.move`
  - `[TODO]` 고정소수점 스케일 규약 확정(온체인 입력값 타입/단위)
    - 가격: 기존처럼 “소수점 2자리 → \*100” 유지(현재 컨트랙트 주석)
    - `avgVol`: “수익률(%) 단위 stddev”를 정수로 전달하기 위한 스케일 정의 필요
      - 예: `avgVolScaled = avgVolPercent * 10_000` (0.0001% 단위)
    - 오버플로우 방지(곱셈 3~4번) 설계 필요
  - `[TODO]` 메타데이터(권장, 온체인 Settlement에 같이 기록)
    - `vol_window_days=30`
    - `vol_sampling=1h` _(차트 데이터가 5초 단위로 쌓여도, `avgVol` 산출에 쓰는 리샘플 규칙을 고정해야 함)_
    - `vol_definition=returns_stddev(%)`
    - `vol_source=binance`
    - `vol_method_version=v1`

### 1.2 에러/상태머신/시간 조건 점검

- `[DONE]` **Lock/Finalize 시간 조건**: `lock_time`, `end_time`은 ms (`clock::timestamp_ms`) / 오프체인도 ms(`Date.now()`)
- `[PARTIAL][DECISION]` **상태 전이**
  - 온체인: OPEN → LOCKED → SETTLED만 존재 (취소/무효 없음)
  - 오프체인: `RoundStatus`에 CANCELLED/VOIDED 존재 + 크론에서 CANCEL도 일부 사용
  - 이번 마감에서 “온체인은 단순 3상태로 고정”할지, 취소/무효까지 온체인 확장할지 결정 필요

### 1.3 운영자 권한/캡 관리

- `[DONE]` 온체인 권한 모델: `AdminCap` 필요 (`betting.move`에서 `create_pool/lock_pool/finalize_round/distribute_payout` 모두 &AdminCap 요구)
- `[TODO]` 서버(크론)가 `AdminCap`을 실제로 보유/사용하는 플로우 구현/문서화
  - env에 `SUI_CAP_OBJECT_ID`는 있으나(= AdminCap object id로 추정), 현재 코드에서 사용처 미확인
    - `lib/env.ts`
- `[DECISION]` “누가 언제 finalize/payout를 호출 가능한지”: 이번 마감은 서버만 호출하도록 고정 권장

### 1.4 가스/성능 관련

- `distribute_payout`가 Bet 1개당 1 tx라면:
  - **이번 마감 목표**: “작은 규모 데모”로 OK
  - 대신 **크론에서 배당 처리 큐/재시도**는 필수(실패 시 계속 남음)

---

## 2) Next.js(서버)에서 Sui 래퍼/서비스 정리(3-layer + DI)

> 컨벤션: Controller(route) → Service → Repository, DI는 `lib/registry.ts`

### 2.1 Sui 트랜잭션 래퍼(Repository 레벨)

- **역할**: “Move 호출 1건”을 타입 안정적으로 감싼 함수들
- **필수 함수 후보**
  - `createPool(roundId, lockTimeMs, endTimeMs) -> poolId`
  - `lockPool(poolId)`
  - `finalizeRound(poolId, goldStart, goldEnd, btcStart, btcEnd, goldAvgVol, btcAvgVol, volMeta) -> { settlementId, feeCoin }`
  - `distributePayout(poolId, settlementId, betObjectId) -> payoutCoin`
  - `mintDel(toAddress, amount)` (출석/보상)
- **해야 할 것**
  - tx 빌드/서명/전송/대기(confirmed)까지 공통 유틸화
  - 에러를 “재시도 가능한 것/불가능한 것”으로 분류해 상위에서 처리
- `[PARTIAL]` 현재 구현된 범위
  - `[DONE]` 베팅(place_bet)용 tx builder + prepare/execute 흐름: `lib/sui/builder.ts`, `lib/sui/service.ts`
  - `[TODO]` 위 목록(create/lock/finalize/payout/mintDel) 래퍼 함수는 아직 코드에서 확인되지 않음

### 2.2 Round/Bets/Rewards 서비스(비즈니스 로직)

- **RoundService**
  - “현재 라운드 상태” 조회(D1) + “온체인 상태”와 매핑
  - `runLockIfNeeded()`, `runFinalizeIfNeeded()`, `runPayoutBatch()`
  - `[TODO]` 정산 입력값 산출(백엔드 책임) 명확화
    - 가격: 라운드 시작/종료 시점 `gold_start/end`, `btc_start/end` 스냅샷
    - `avgVol`: D1 `chartData`에서 과거 30일 PAXG/BTC를 조회해 `lib/services/normalizedStrength.ts`로 계산
      - **주의**: 정산 로직은 `/api/chart/normalized-strength`(HTTP)를 호출하지 말고, 동일 라이브러리를 직접 호출해 산출(내부 호출)
    - 산출 결과: 온체인 finalize에 `가격 4개 + avgVol 2개 + 메타데이터` 전달
- **RewardService**
  - `grantDailyAttendance(address)` (중복 지급 방지 포함)

### 2.3 Controller(API route) — 크론 엔드포인트

- `app/api/cron/**/route.ts` 형태로 구성
- 예시 엔드포인트(권장)
  - `POST /api/cron/rounds/create` (라운드 시작 시)
  - `POST /api/cron/rounds/lock`
  - `POST /api/cron/rounds/finalize`
  - `POST /api/cron/rounds/payout`
  - `POST /api/cron/rewards/attendance`
- **필수**: 크론 인증(헤더 시크릿) + idempotency(중복 호출되어도 안전)
- `[DONE]` 크론 인증/라우트 뼈대는 존재
  - `app/api/cron/**/route.ts` + `verifyCronAuth`
- `[PARTIAL]` idempotency는 서비스 단에서 일부만 구현
  - 예: `RoundService.settleRound()`는 이미 SETTLED면 스킵
  - 예: `RoundService.openRound()`는 lockTime 지나면 CANCEL 처리
  - 온체인 호출 멱등성(예: 이미 LOCKED면 lock 스킵)은 아직 구현되지 않음(온체인 호출 자체가 아직 없음)

---

## 3) 가격 데이터 파이프(승자 입력값)

### 3.1 이번 마감에서의 현실적 선택

- **시가/종가 + avgVol(평소 변동성) 필요**하므로, 오프체인에서:
  - 라운드 시작 시점 가격 스냅샷 저장
  - 라운드 종료 시점 가격 스냅샷 저장
  - finalize 시 `가격 4개 + avgVol 2개 + 메타데이터` 전달
- `[PARTIAL]` 현재 상태
  - 가격 스냅샷 API는 있음: `GET /api/price/snapshot`
  - 하지만 크론(open/finalize)에서 실제로 호출/저장하지 않고 mock 사용 중
  - 즉, “저장 파이프”와 “finalize 입력값의 감사추적(재현성)”은 아직 불완전

### 3.2 필수 고려사항

- **타임스탬프 정합성**: “라운드 시작/끝 시각”과 가격 스냅샷 시간의 허용 오차 정의(예: ±30초)
- **재현성**: 동일 라운드는 같은 입력값으로 다시 finalize 가능(혹은 이미 finalized면 스킵)
- `[TODO]` `avgVol` 산출 규칙을 “정산 스펙”으로 못박기(도메인 분리)
  - 차트(인사이트) 지표는 다양해도 되지만, **정산(돈/룰) 지표는 단 1개 정의로 고정**해야 함
  - `avgVol` 정의(정산 스펙 고정): PR#21의 `calculateAverageVolatility`
    - 입력: 과거 가격 시계열
    - 처리: 인접 가격으로 수익률(%) 시퀀스를 만든 뒤 그 표준편차(stddev)를 계산
  - 구현 방식(백엔드): 정산 크론이 D1 `chartData`에서 **과거 30일 PAXG/BTC**를 조회해 `avgVol`을 직접 계산(또는 캐시)하고 온체인 finalize에 넘김
  - `/api/chart/compare`는 price stddev 기반 지표로 “정산과 무관한 UI 인사이트용”으로 명시
- `[TODO]` 데이터 부족/예외 규칙 정의
  - 과거 30일 데이터가 부족하면 `avgVol`이 0에 가깝게 나와 강도가 비정상적으로 커질 수 있음(PR#21 주의사항)
  - 최소 데이터 조건(예: 최소 N개 bar)과 fallback 정책(예: 라운드 정산 지연/취소/고정값 사용)을 결정하고 메타데이터로 남기기

---

## 4) 출석 보상(DEL 민팅) 설계/구현

### 4.1 요구사항(최소)

- **하루 1회**, 지갑 주소 기준, 중복 지급 방지(D1 기록)
- **지급량 고정**(예: 10 DEL)로 단순화

### 4.2 구현 체크리스트

- D1 테이블(또는 기존 유저/리워드 테이블)에 `attendance_rewards` 기록
  - `walletAddress`, `date(YYYY-MM-DD)`, `amount`, `txDigest`
- API
  - `POST /api/rewards/attendance`(유저 호출) 또는 `POST /api/cron/rewards/attendance`(서버 호출)
- 온체인
  - `mintDel` 트랜잭션 + 실패 시 재시도
- `[TODO]` 현재 레포에서 attendance/reward API/Service는 확인되지 않아 미구현으로 판단 (2025-12-14 기준)

---

## 5) 프론트(UI/UX) — “투명 정산”을 눈에 보이게

### 5.1 반드시 들어가야 할 화면/컴포넌트

- **Round 상세**에 아래를 노출:
  - Pool ID, Settlement ID
  - 금/비트 시가/종가, winner, payout_ratio, platform_fee
  - 베팅 총액/양쪽 풀/베팅 수
- **온체인 조회 링크**(최소한 tx digest / object id 복사)
- “이 값은 온체인 Settlement에서 조회됨”이라는 문구(가치 전달)

### 5.2 차트팀(현준) 산출물과의 결합

- 차트는 “재미/인사이트”
- 온체인 Settlement는 “정산 증빙”
- 두 개를 한 화면에서 연결: “이 차트 구간(라운드) → 이 Settlement로 정산됨”

---

## 6) 운영/안정화(크론/재시도/관측성)

### 6.1 크론 안정성(필수)

- 각 크론 작업은 **멱등**해야 함
  - 예: 이미 LOCKED면 lock 스킵
  - 이미 SETTLED면 finalize 스킵
  - payout은 “미지급 bet만” 처리
- **재시도 전략**
  - 네트워크/가스/일시 오류: 재시도
  - 논리 오류(too_early 등): 스케줄 재시도

### 6.2 관측성(최소)

- 크론 실행 로그: 시작/종료/처리 건수/실패 사유
- 각 tx digest 저장(D1) → 문제 발생 시 추적 가능
- `[PARTIAL]` 베팅 tx digest는 `bets.suiTxHash`로 저장됨
  - 반면, 라운드 lock/finalize/payout의 온체인 tx digest/settlement object id 저장은 아직 없음(온체인 호출 미구현)

---

## 7) 테스트/검증 체크리스트(최소)

- **Contract 레벨**
  - 베팅 성공/최소금액 실패
  - lock_time 전 lock 실패, end_time 전 finalize 실패
  - finalize 후 payout 성공 + Bet 소각 확인
- **서버 레벨**
  - 크론 멱등성(2번 호출해도 안전)
  - 출석 보상 중복 지급 방지
- **UI 레벨**
  - Settlement 값이 실제 온체인 값과 일치하게 표시

---

## 8) 4일 작업 우선순위(권장)

- **Day 1**
  - 정산 룰 확정(정규화 강도) + `avgVol` 스펙(윈도우/샘플링/스케일/소스/버전) 확정
  - 가격 스냅샷 저장 파이프(open/finalize 크론에서 실제 호출) 연결
  - Sui 래퍼(Repository) 뼈대
- **Day 2**
  - Sui finalize/lock/payout 크론 연결 + D1에 settlement 메타(가격/avgVol/버전/tx digest) 저장
- **Day 3**
  - 출석 보상 민팅 + Settlement 영수증 UI
- **Day 4**
  - 전구간 통합 리허설(라운드 1개 end-to-end) + 실패 재시도/로그 보강

---

## 9) 관련 문서/레퍼런스(현재 레포)

- `docs/ehdnd/sui/BET_ONCHAIN_FLOW.md`
- `docs/ehdnd/sui/SUI_CONTRACT_SPEC.md`
- `docs/ehdnd/sui/web2web3.md`
