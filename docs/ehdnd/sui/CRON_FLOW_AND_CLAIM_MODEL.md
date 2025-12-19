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

### 0.1) 구현 결정(2025-12-15)

- **결정 A) `SETTLED` 의미**
  - Off-chain `rounds.status=SETTLED`는 “모든 유저가 payout을 받았다”가 아니라,
    **on-chain `finalize_round`가 성공해 Settlement(영수증)가 생성되어 Claim 가능한 상태**를 의미한다.
  - 실제 payout 완료 여부는 **Bet 단위(Claim TxDigest 등)로 추적**한다. (라운드 단위로 “완료”를 강제하지 않음)

- **결정 B) Job 5(서버 배당/정산) 폐기**
  - Cron이 승자 Bet을 순회하며 `distribute_payout`을 호출하는 Job 5는 폐기한다.
  - 배당은 유저가 Bet owned object를 제출해 `claim_payout`을 호출하는 **Claim 모델**로만 진행한다.
  - Claim은 `prepare/execute` API(B1)로 구현하되, **Job 4 연결 완료 후 다음 스코프**로 미룬다.

- **결정 C) VOID 규칙**
  - VOID는 “온체인 Settlement에 outcome/voidReason을 명시”하고, Claim에서 “원금 환불(refund)”로 처리한다.
  - 오프체인 정책(입력/판정):
    - avgVol 데이터 부족(<360) 또는 0 → `goldAvgVol/btcAvgVol=0`으로 on-chain `finalize_round` 호출하여 VOID Settlement 생성
    - 가격 데이터 invalid/결측 → end price를 start price로 fallback + `avgVol=0`으로 VOID Settlement 생성
    - winning_pool == 0 → on-chain에서 VOID 처리(시장 승자는 기록하되 payout은 refund)

- **결정 D) Claim은 “A안”으로 구현한다 — betObjectId는 베팅 execute 단계에서 서버가 파싱/저장**
  - 목표: Claim(배당 청구) 흐름에서 **유저 입력을 최소화**하고, 서버가 신뢰할 수 있는 레퍼런스(`bets.suiBetObjectId`)로 sponsored tx를 빌드한다.
  - 구현 원칙:
    - 베팅 `place_bet` 실행(tx execute) 성공 시 `objectChanges`에서 생성된 `Bet` object id를 파싱해 `bets.suiBetObjectId`에 저장한다.
    - 이후 Claim prepare는 `betId`만 받아도(또는 betId + userAddress) 서버가 `betObjectId`를 DB에서 조회해 tx를 빌드할 수 있다.
  - 왜 A안인가(의사결정 이유):
    - **보안/무결성**: 유저가 `betObjectId`를 직접 제출하게 되면(대안) “다른 Bet object로 시도/재사용/오입력”을 서버가 매번 방어해야 한다.
      A안은 “서버가 알고 있는 bet ↔ betObjectId” 매핑으로 tx를 만든다.
    - **UX/지원 비용**: 유저가 object id를 직접 다루는 것은 지갑/SDK/Explorer 지식이 필요해 장애/CS가 급증한다.
    - **멱등성/재시도 설계가 단순**: bet execute가 성공했다면 betObjectId는 **불변**이며, claim은 “해당 Bet을 소비”하므로 2회 청구가 자연스럽게 방지된다.
    - **Sui-first & Recovery와 정합**: “체인 성공, DB 실패”가 있을 수 있으므로 execute 시점의 txDigest와 objectChanges를 기반으로
      DB에 최소한의 audit 키(`suiTxHash`, `suiBetObjectId`)를 남겨 두는 것이 복구/추적에 유리하다.
  - 트레이드오프/주의:
    - execute 응답에서 `objectChanges` 파싱이 실패하면 Claim이 막힐 수 있으므로, 파싱 실패 시 **즉시 에러 + 복구 경로(recover)** 를 준비하는 것을 권장한다(아래 TODO 참고).

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
- **Sui 호출(구현됨)**:
  - `lib/sui/admin.ts#createPool(roundNumber, lockTimeMs, endTimeMs)`
  - 멱등성:
    - `rounds.suiPoolAddress`가 있으면 재호출하지 않음
    - 없으면 on-chain pool 생성 후 `suiPoolAddress`/`suiCreatePoolTxDigest`를 먼저 저장
- **DB 저장**
  - `goldStartPrice`, `btcStartPrice`
  - `priceSnapshotStartAt`, `startPriceSource`
  - `priceSnapshotMeta`(start 메타 포함)
  - `suiPoolAddress`(+ create tx digest)

#### (TODO) 가격 스냅샷 연동 가이드 (현준 PR 머지 후)

- 목표: “정산 입력 가격은 재현 가능해야 한다” → **tick이 아니라 1m kline close** 사용
- 구현 가이드/결정 기록: `docs/ehdnd/sui/PRICE_DATA_INTEGRATION_DECISION.md`

### Job 3) Betting Locker — `/api/cron/rounds/lock`

- **목표**: lockTime 이후 `BETTING_LOCKED` 전이 + (권장) on-chain lock 수행
- **Sui 호출(구현됨)**:
  - `lib/sui/admin.ts#lockPool(poolId)` where poolId = rounds.suiPoolAddress
  - 멱등성:
    - `rounds.suiLockPoolTxDigest`가 있으면 재호출하지 않음
    - 없으면 on-chain lock 후 `suiLockPoolTxDigest`를 먼저 저장
- **DB 저장**
  - `bettingLockedAt`
  - `suiLockPoolTxDigest`

### Job 4) Round Finalizer — `/api/cron/rounds/finalize`

- **목표**: endTime 이후 라운드 정산(Settlement 생성) + DB에 영수증 키 저장
- **입력**
  - 가격 스냅샷(end) + meta
  - avgVol 계산 결과 + meta
- **Sui 호출(연결 대상)**:
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
  - `rounds.status`:
    - `SETTLED`: Settlement 생성 완료(Claim 가능)
    - `VOIDED`: Settlement는 생성되었지만 outcome=VOID(Claim 시 원금 환불)

#### (TODO) end price 스냅샷 연동 가이드 (현준 PR 머지 후)

- 구현 가이드/결정 기록: `docs/ehdnd/sui/PRICE_DATA_INTEGRATION_DECISION.md`

#### 구현 메모 (현재 코드 기준)

- **avgVol 계산**: `lib/rounds/avgVol.service.ts#calculateSettlementAvgVol()`
  - Binance `klines` 기반(`PAXGUSDT`, `BTCUSDT`)
  - interval=`1h`, lookback=`720`(30일)
  - returns(%) 표준편차(stddev) = avgVol
  - 데이터 부족(`<360`)이면 **avgVol=0 → on-chain VOID**로 처리
- **end price invalid/결측 처리**: end price를 start price로 fallback + **avgVol=0으로 강제(VOID)** 처리
- **멱등성**: `rounds.suiFinalizeTxDigest/suiSettlementObjectId/suiFeeCoinObjectId`가 이미 있으면 finalize를 재호출하지 않는다.

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

## 4.1) Claim API 설계 메모 (A안)

- **Prepare 입력 최소화**: `betId`만으로도 tx 빌드 가능해야 한다.
  - 서버는 `betId → bets.suiBetObjectId + rounds.suiPoolAddress + rounds.suiSettlementObjectId`를 조회해 `claim_payout` PTB를 만든다.
- **DB 상태는 “표시/인덱스”**: Claim 성공 여부는 체인(=Bet 소각)으로 결정된다.
  - 오프체인은 `bets.suiPayoutTxHash`, `payoutAmount`, `settlementStatus` 등을 “조회/UX” 용도로만 저장한다.
- **서버 경유 Claim만 허용(현 스코프)**:
  - API:
    - `POST /api/bets/claim/prepare`
    - `POST /api/bets/claim/execute`
  - (참고) direct claim(유저가 서버 없이 체인 직접 호출)을 완전히 막을 수는 없으므로,
    이 스코프에서는 “서버를 통한 claim만 UX로 제공”하고 DB 동기화/복구는 다음 작업으로 둔다.

## 5) VOID(무효/환불) 정책 — 반드시 결정 필요

대표 VOID 조건:

- avgVol 데이터 부족(<360) 또는 0
- 가격 데이터 invalid/결측
- **winning_pool == 0** (시장 승자는 나오지만 payout 불가능)

권장 방향:

- winner는 “시장 승자”로 유지
- VOID인 경우 Settlement에 outcome/voidReason을 명시하고,
  claim에서 “원금 환불(refund)” 규칙으로 처리하는 구조 권장

현재 상태(온체인):

- `contracts/sources/betting.move`에 **VOID(outcome/void_reason) + 환불(claim 시 원금 환불)** 로직이 구현됨
- 오프체인(서비스/DB)에서 VOID를 어떻게 표시/저장할지(예: rounds.status=VOIDED 전이, voidReason 저장)는 후속 작업

---

## 6) Recovery (운영 관점)

현재 서버에는 `RoundService.recoveryRounds()` 골격이 있으며(Job 6 개념, 라우트는 `app/api/cron/recovery/route.ts`),
아래를 목표로 확장하는 것을 권장한다:

- **체인 성공, DB 실패 복구**
  - rounds에 txDigest/settlementId 누락 시: chain 조회로 복구(가능하면)
- **lock/finalize 재시도**
  - D1 상태가 맞고, txDigest가 없으면 재시도
  - txDigest가 있으면 “이미 수행됨”으로 단락
- **claim 상태 동기화(선택)**
  - claim을 서버 경유로 강제하면 거의 불필요
  - direct claim 허용 시: 이벤트/tx 기반으로 DB 반영 job 필요

> 상세 설계안: `docs/ehdnd/sui/RECOVERY_DESIGN.md`

---

## 7) 다음으로 할 일 (TODO / 운영 리스크 최소화)

### 7.1) 보안/인증 일괄화 (Prepare/Execute 전 구간)

- **원칙**: `userId`는 request body에서 받지 않고, 서버 인증 컨텍스트(예: cookie의 `suiAddress`)로부터 결정한다.
  - 이유: body 기반 `userId`는 위변조 가능성이 있어, nonce 바인딩/Bet 소유권 검증이 복잡해지고 실수 여지가 커진다.
- **적용 범위**
  - `POST /api/bets` (prepare)
  - `POST /api/bets/execute`
  - `POST /api/bets/claim/prepare`
  - `POST /api/bets/claim/execute`
- **검증 규칙**
  - `bet.userId === authenticatedUserId`가 아니면 거부
  - nonce record에도 `userId`를 바인딩하고 execute 시 동일성 확인

#### ✅ 구현 상태 (2025-12-15 반영)

- `POST /api/bets`
  - 세션 기반(`cookie.suiAddress`)으로 `{ userId, suiAddress }`를 확정하고,
  - request body의 `userAddress`는 **세션 주소와 일치 검증 + 서버가 세션 주소로 덮어쓰기**로 처리한다.
- `POST /api/bets/execute`
  - **`userId`를 request body에서 받지 않는다.**
  - 서버가 세션의 `userId`를 사용해 bet owner/nonce 바인딩을 검증한다.
- `POST /api/bets/claim/prepare`, `POST /api/bets/claim/execute`
  - `requireAuth()` 기반으로 세션에서 userId를 확보하고,
  - `bet.userId === session.userId` 검증을 통해 소유권을 보장한다.

---

### 7.1.1) Bet 조회/공개 피드 분리 (2025-12-15 의사결정 반영)

홈 공개 피드와 “내 베팅”은 권한/노출 필드가 다르므로 분리한다.

- `GET /api/bets/public`: 홈 공개 피드 (인증 불필요)
  - 서버 경유로 생성/체결된 bets(D1 인덱스)만 노출
  - 지갑 주소는 기본 마스킹(`0x12ab…89ef`) + on-chain 검증 링크용 키(txDigest/objectId) 포함
- `GET /api/me/bets`: 내 베팅 목록 (인증 필요)
  - userId는 세션에서 결정
- (Legacy) `GET /api/bets`
  - 호환을 위해 유지하되, `userId` query는 **반드시 본인(userId==session.userId)**만 허용한다.

### 7.2) Claim/Bet Recovery (체인 성공, DB 실패)

- **문제**: sponsored tx execute가 성공했는데 DB 업데이트가 실패하면,
  - 베팅: `bets.suiBetObjectId`가 비어 Claim이 막힘
  - Claim: `bets.suiPayoutTxHash`가 비어 UI에서 미청구처럼 보일 수 있음
- **권장 해결**
  - (A) **Recover API**: `POST /api/bets/recover` / `POST /api/bets/claim/recover`
    - 입력: `betId` (+ optional `txDigest`)
    - 동작: chain 조회(`getTransactionBlock`)로 objectChanges/events를 재파싱하여 DB를 보정
  - (B) **Backfill Job(선택)**: 최근 N시간 내 “EXECUTED인데 suiBetObjectId null” 같은 레코드를 주기적으로 보정
  - (C) **로그/알림**: 파싱 실패/DB 업데이트 실패 시 digest와 betId를 반드시 남겨 운영자가 즉시 복구할 수 있게 한다.
