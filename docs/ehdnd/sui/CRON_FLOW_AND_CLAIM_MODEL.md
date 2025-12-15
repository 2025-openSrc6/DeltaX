## Cron Flow + Claim 모델 (Sui 온체인 정산) — 운영/구현 가이드

이 문서는 deltaX의 라운드 크론(Job 1~4)과, 라운드 종료 후 **유저 Claim 기반 정산 모델**을
“어디서 어떤 Sui 트랜잭션을 수행하는지 / 어떤 순서로 저장해야 하는지(Sui-first)” 관점에서 정리한다.

---

## 0) 핵심 결정(요약)

- **돈(DEL) 이동의 단일 진실 소스는 Sui 체인**
  - 베팅: `place_bet` 실행으로 DEL이 풀에 lock
  - 정산: `finalize_round`로 Settlement(영수증) 생성 + 풀 상태 변경
  - 배당: 유저가 `Bet` owned object를 제출해 `claim_payout` 호출(승자 payout / 패자 0, Bet은 소각)
- **DB(D1)는 “인덱스/캐시/UX” 역할**
  - poolId/settlementId/txDigest/메타데이터 저장
  - 라운드 상태(FSM), 가격/avgVol/메타, 화면용 통계/집계
  - “진짜 DEL 잔액”을 DB에서 단일 소스로 관리하지 않음(불일치 비용이 큼)

---

## 1) 구성요소(레이어)

- **cron route (`app/api/cron/rounds/*/route.ts`)**
  - 인증/외부 API 호출/Service 호출/응답 포맷만
- **RoundService (`lib/rounds/service.ts`)**
  - FSM/시간조건/멱등성/정산 규칙 결정
  - Sui-first 오케스트레이션(아래 2절 참고)
- **Sui admin wrapper (`lib/sui/admin.ts`)**
  - tx build → dryRun → execute → confirm → objectChanges 파싱
  - 입력 스케일링/범위(u64) 가드

---

## 2) Sui-first 원칙(중요)

라운드의 “돈이 걸린 단계”는 항상 다음 순서를 권장한다:

1. **(Service) 상태/시간/필수 데이터 검증**
2. **(Service → Sui wrapper) Sui tx 실행**
3. **(Service) txDigest/objectId를 DB에 저장**
4. **(Service) FSM 상태 전이/후속 처리**

이유:

- D1 트랜잭션이 완전 원자적이지 않은 환경에서 “체인 성공, DB 실패”가 발생할 수 있음
- 따라서 txDigest/objectId를 DB에 남겨 **Recovery가 idempotent하게 복구**할 수 있어야 함

---

## 3) Cron Jobs (Job 1~4) — 목표/입력/출력

### Job 1) Round Creator — `/api/cron/rounds/create`

- **목표**: 다음 라운드를 D1에 `SCHEDULED`로 생성
- **Sui 호출**: 없음(권장: create_pool은 Job2/오픈 시점에 수행)
- **출력(DB)**: rounds row 생성

### Job 2) Round Opener — `/api/cron/rounds/open`

- **목표**: 라운드 시작 시각 도달 시 `BETTING_OPEN`으로 전이 + 시작가/메타 저장 + (권장) on-chain pool 생성
- **입력**: 가격 스냅샷(start) + meta
- **권장 Sui 호출(추가될 부분)**:
  - `lib/sui/admin.ts#createPool(roundNumber, lockTimeMs, endTimeMs)`
  - 성공 시 rounds에:
    - `suiPoolAddress`(poolId)
    - `suiCreatePoolTxDigest`
    - (선택) admin cap/패키지 버전 정보(감사용)
- **DB 저장**
  - `goldStartPrice`, `btcStartPrice`
  - `priceSnapshotStartAt`, `startPriceSource`
  - `priceSnapshotMeta`(start 메타 포함)
  - `suiPoolAddress`(+ create tx digest)

### Job 3) Betting Locker — `/api/cron/rounds/lock`

- **목표**: lockTime 이후 `BETTING_LOCKED` 전이 + (권장) on-chain lock 수행
- **권장 Sui 호출(추가될 부분)**:
  - `lib/sui/admin.ts#lockPool(poolId)` where poolId = rounds.suiPoolAddress
  - 성공 시 rounds에 `suiLockPoolTxDigest` 저장
- **DB 저장**
  - `bettingLockedAt`
  - `suiLockPoolTxDigest`

### Job 4) Round Finalizer — `/api/cron/rounds/finalize`

- **목표**: endTime 이후 라운드 정산(Settlement 생성) + DB에 영수증 키 저장
- **입력**
  - 가격 스냅샷(end) + meta
  - avgVol 계산 결과 + meta
- **권장 Sui 호출(추가될 부분)**:
  - `lib/sui/admin.ts#finalizeRound(poolId, prices, avgVols, volMeta?)`
  - 성공 시 rounds에:
    - `suiFinalizeTxDigest`
    - `suiSettlementObjectId`(settlementId)
    - `suiFeeCoinObjectId`(fee coin id)
- **DB 저장**
  - `goldEndPrice`, `btcEndPrice`
  - `priceSnapshotEndAt`, `endPriceSource`
  - `priceSnapshotMeta`(end 메타 포함)
  - `goldAvgVol`, `btcAvgVol`, `avgVolMeta`
  - `winner`(시장 승자; payout 승자와 분리 가능)

---

## 4) 라운드 종료 후(배당) — Claim 모델

### 왜 Claim 모델인가?

- `place_bet`는 Bet을 유저 주소로 transfer → Bet은 **유저 소유 owned object**
- 따라서 cron/admin이 유저 owned object를 임의로 소비할 수 없음(서명/소유권 문제)
- “유저가 Bet object를 제출”하는 claim 방식이 Sui/Move 모델에 자연스러움

### Claim 실행 방식(권장: sponsored prepare/execute)

- **Prepare API(서버)**: Claim PTB(txBytes) 빌드 + dryRun + nonce 저장
  - `claim_payout(poolId, settlementId, betObjectId, clock)`
- **Execute API(서버)**: 유저 서명 + sponsor 서명으로 execute
- **성공 시 DB 기록**
  - bet/claim 레코드에 `claimTxDigest`, `claimedAt`, `status=CLAIMED` 등
  - (선택) 유저 통계(누적 payout, 승/패 등 “표시용” 집계)

> 주의: “진짜 DEL 잔액”은 체인에 있으므로 DB에서 잔액을 authoritative 하게 관리하지 않는다.

---

## 5) VOID(무효/환불) 정책 — 반드시 결정 필요

대표 VOID 조건:

- avgVol 데이터 부족(<360) 또는 0
- 가격 데이터 invalid/결측
- **winning_pool == 0** (시장 승자는 나오지만 payout 불가능)

권장 방향:

- winner는 “시장 승자”로 유지
- VOID인 경우 Settlement에 outcome/voidReason을 명시하고,
  claim에서 “원금 환불(refund)” 규칙으로 처리하는 구조 권장

현재 상태:

- VOID 분기/환불 분기는 아직 확정/구현 전(정책 결정 후 Move + Service 수정 필요)

---

## 6) Recovery (운영 관점)

현재 서버에는 `RoundService.recoveryRounds()` 골격이 있으며(Job 6 개념),
아래를 목표로 확장하는 것을 권장한다:

- **체인 성공, DB 실패 복구**
  - rounds에 txDigest/settlementId 누락 시: chain 조회로 복구(가능하면)
- **lock/finalize 재시도**
  - D1 상태가 맞고, txDigest가 없으면 재시도
  - txDigest가 있으면 “이미 수행됨”으로 단락
- **claim 상태 동기화(선택)**
  - claim을 서버 경유로 강제하면 거의 불필요
  - direct claim 허용 시: 이벤트/tx 기반으로 DB 반영 job 필요
