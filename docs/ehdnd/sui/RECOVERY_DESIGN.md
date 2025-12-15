## Recovery 설계안 (Round + Bet + Claim) — Sui-first 불일치 복구

이 문서는 deltaX에서 **체인(Sui)은 성공했는데 DB(D1)가 실패/부분 실패**하여
오프체인 인덱스/UX 상태가 깨지는 문제를 복구하기 위한 설계안이다.

> 핵심: Recovery는 “돈을 다시 움직이는 로직”이 아니라 **체인 데이터를 다시 조회하여 DB를 보정하는 작업**이 우선이다.

---

## 0) 목적 / 비목적

### 목적

- **체인 성공, DB 실패**로 인해 누락된 키(txDigest/objectId/events-derived fields)를 DB에 복구
- 사용자 UX(Claim 가능/완료 표시, 정산 영수증 링크 등)의 신뢰도를 회복
- 운영자가 “무슨 상태가 깨졌는지/어떻게 고치면 되는지” 명확히 판단할 수 있게 표준화

### 비목적

- 체인에서 이미 완료된 돈의 이동을 DB만으로 “되돌리기/재지급”하지 않는다.
- 체인에 존재하지 않는 오프체인 UUID(`roundId`, `betId`)만으로 체인 상태를 역검색하는 것을 전제로 하지 않는다.

---

## 1) 핵심 원칙 (Sui-first + 복구 가능성)

### 1.1 “복구 키”는 결국 txDigest / objectId

- `roundId`(UUID), `betId`(UUID)는 체인에 직접 존재하지 않는다.
- 따라서 Recovery는 다음 키 중 하나가 **DB 또는 로그/클라이언트**에 남아 있어야 실현 가능하다:
  - **txDigest**
  - Sui object id: `poolId`, `settlementId`, `betObjectId`

### 1.2 Recovery 작업을 2종류로 분리한다

- **Safe Backfill (자동화 가능)**:
  - “이미 체인 성공이 확실한 txDigest를 가지고” 체인 조회 → 누락된 objectId/이벤트 파생 값만 DB에 채운다.
  - 체인 재실행 없음. 조회 + DB 업데이트만 수행.
- **Risky Retry (자동화 지양)**:
  - txDigest가 없고, 체인 성공 여부부터 불명확한 상태에서 tx를 “재시도”하는 복구.
  - 자동 크론에서는 금지/보류, 운영자 승인/수동 트리거 중심으로 간다.

---

## 2) 현재 시스템의 주요 “복구 대상 키”

### 2.1 Round (Job2~4)

- `rounds.suiPoolAddress` (create_pool 결과)
- `rounds.suiCreatePoolTxDigest`
- `rounds.suiLockPoolTxDigest`
- `rounds.suiFinalizeTxDigest`
- `rounds.suiSettlementObjectId` (finalize_round에서 생성되는 Settlement)
- `rounds.suiFeeCoinObjectId` (platform fee coin id)

### 2.2 Bet (place_bet)

- `bets.suiTxHash` (place_bet txDigest)
- `bets.suiBetObjectId` (**A안 핵심**: objectChanges로 파싱하여 저장)

### 2.3 Claim (claim_payout)

- `bets.suiPayoutTxHash` (claim txDigest)
- `bets.payoutAmount` (event `PayoutDistributed.amount`에서 파싱)
- `bets.resultStatus`, `bets.settlementStatus`, `bets.settledAt`

---

## 3) Recovery가 필요한 대표 케이스 (Round + Bet + Claim)

### 3.1 Round: 체인 성공, DB 실패(부분 저장 누락)

- create_pool 성공 → DB에 `suiPoolAddress` 누락
- lock_pool 성공 → DB에 `suiLockPoolTxDigest` 누락
- finalize_round 성공 → DB에 `suiSettlementObjectId`/`suiFeeCoinObjectId` 누락

**커버 방식(Safe Backfill)**:

- DB에 txDigest가 존재하면(`suiCreatePoolTxDigest`, `suiFinalizeTxDigest` 등)
  - `getTransactionBlock(digest, { showObjectChanges: true })`로 조회
  - objectChanges에서 필요한 objectId를 재파싱하여 DB 업데이트

> txDigest 자체가 없다면 자동 복구가 어려우며(체인 역검색 비용/복잡도↑),
> 운영 로그/클라이언트 반환 digest 기반의 수동 recover가 필요하다.

### 3.2 Bet: 체인 성공, DB 실패(A안 핵심)

- place_bet 성공 → DB에 `suiBetObjectId` 누락 → Claim이 막힘

**커버 방식(Safe Backfill)**:

- `bets.suiTxHash`는 있는데 `bets.suiBetObjectId`가 null인 레코드를 스캔
- 해당 digest로 체인 조회 → objectChanges에서 `::betting::Bet` created object id 파싱 → DB 업데이트

### 3.3 Claim: 체인 성공(소각/지급), DB 실패

- claim_payout 성공 → DB에 `suiPayoutTxHash`/`payoutAmount`/status 반영 실패
- UI 상 “미청구”처럼 보이거나 결과가 PENDING에 멈춤

**커버 방식(Safe Backfill)**:

- `bets.suiPayoutTxHash`가 있으면 해당 digest로 체인 조회
  - events에서 `PayoutDistributed.amount` 파싱(이벤트 없으면 payout=0)
  - DB에 `payoutAmount`, `settlementStatus=COMPLETED`, `resultStatus` 반영

> Claim은 Bet owned object를 소비(소각)하므로 “재실행(retry)” 복구가 아니라
> **이미 실행된 tx를 기준으로 DB만 맞추는 방식**이 기본이다.

---

## 4) 실행 형태: 자동 Cron vs 수동 Recover API

### 4.1 자동 Cron(Job 6) — Safe Backfill 전용

- 라우트: `POST /api/cron/recovery`
- 스케줄: `app/api/cron/scheduled/route.ts`에서 매분 호출됨
- 원칙:
  - “체인 재실행(retry)” 금지
  - DB에 digest가 있는 레코드만 대상으로 조회/파싱/DB 보정
  - 결과는 숫자/요약만 반환(운영 로그로 상세 기록)

**권장 작업 목록(예시)**:

- Round backfill:
  - `suiFinalizeTxDigest`는 있는데 `suiSettlementObjectId`가 null인 rounds
  - `suiCreatePoolTxDigest`는 있는데 `suiPoolAddress`가 null인 rounds
- Bet backfill:
  - `suiTxHash`는 있는데 `suiBetObjectId`가 null인 bets
- Claim backfill:
  - `suiPayoutTxHash`는 있는데 `payoutAmount`/`settlementStatus`가 미반영인 bets

### 4.2 수동 Recover API — 운영/디버그용(정확한 타겟 복구)

자동 크론이 커버하지 못하는 케이스(특히 txDigest 누락)를 위해 수동 경로를 제공한다.

**권장 엔드포인트(안)**:

- `POST /api/bets/recover`
  - 입력: `{ betId: string, txDigest?: string }`
  - 동작:
    - txDigest가 주어지면 해당 tx에서 Bet object id 파싱 후 `bets.suiTxHash/suiBetObjectId` 보정
    - txDigest가 없으면 DB에 있는 `bets.suiTxHash`로 시도, 없으면 “manual required” 에러

- `POST /api/bets/claim/recover`
  - 입력: `{ betId: string, txDigest?: string }`
  - 동작:
    - txDigest 기반으로 claim 이벤트를 파싱하여 `bets.suiPayoutTxHash/payoutAmount/status` 보정

- (선택) `POST /api/rounds/recover`
  - 입력: `{ roundId: string, finalizeTxDigest?: string, createPoolTxDigest?: string }`
  - 동작: 해당 digest에서 `poolId/settlementId/feeCoinId`를 파싱해 rounds를 보정

> 인증: 운영자 전용(또는 cron auth)으로 제한 권장.

---

## 5) “DB는 맞고 체인은 틀린” 케이스에 대한 방침

원칙적으로 Sui-first를 지키면 적어야 하지만, 실수/장애로 발생할 수 있다.

- 예: rounds.status는 `SETTLED`인데 체인 BettingPool.status는 아직 SETTLED가 아님

**대응 권장**:

- 자동 크론에서 “체인 재실행”을 하지 않는다.
- 체인 조회로 불일치를 감지하면:
  - DB를 보정(예: status를 이전 단계로 되돌림)하거나
  - “manual required”로 알림/태그만 남긴다.

---

## 6) 로깅/알림 규칙(운영)

- Recovery 실행 시 반드시 남길 것:
  - 대상 id: `roundId`/`betId`
  - digest: `sui*TxDigest`
  - 어떤 필드를 어떤 값으로 보정했는지(diff)
- 파싱 실패 시:
  - `SUI_PARSE_FAILED`로 에러를 명확히 남기고 digest 포함
  - (선택) Slack 경고 알림(“자동 복구 실패”)

---

## 7) 테스트 전략(최소)

- 파서 단위 테스트:
  - objectChanges에서 `Bet` object id 추출
  - events에서 `PayoutDistributed.amount` 추출(없으면 0)
- recovery 서비스 테스트:
  - “digest 존재 + 필드 null” 케이스에서 올바른 DB 업데이트 호출 여부
  - “digest 없음”은 safe backfill 대상에서 제외됨을 검증

---

## 8) 구현 체크리스트(작업 순서)

- [ ] `RoundService.recoveryRounds()`를 noop에서 Safe Backfill로 변경
- [ ] Round/Bet/Claim 각각의 “스캔 쿼리 + 업데이트” repository 메서드 추가
- [ ] 수동 Recover API(운영자용) 엔드포인트 추가
- [ ] cron auth/운영자 auth 정책 확정 및 적용
- [ ] “체인 재실행”은 분리된 수동 운영 플로우로만 진행(자동화 금지)
