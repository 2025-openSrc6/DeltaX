## Bet + Claim API Guide (현재 구현 기준, 2025-12-15)

이 문서는 deltaX의 **베팅(place_bet) / 정산(claim_payout) API가 현재 코드에서 어떻게 구현되어 있고**,
**어디서 사용하려고 만든 것인지**, 그리고 **어떻게 호출해서 쓰는지**를 “Sui-first + Claim 모델” 관점에서 정리한다.

> 핵심 원칙: **돈(DEL) 이동의 단일 진실 소스는 Sui**이고, **D1은 인덱스/캐시/UX** 역할이다.

---

## 0) 의사결정 요약 (왜 이렇게 했나?)

### 0.1 Claim 모델로 확정 (Job5 서버 배당 폐기)

- 베팅은 `place_bet`로 DEL을 풀에 lock하고, 정산은 `finalize_round`로 Settlement(영수증)를 만든다.
- **배당/환불은 유저가 Bet owned object를 제출해 `claim_payout`을 호출**하는 Claim 모델로만 진행한다.
- 이유: Move/Sui 소유권 모델상 서버(cron/admin)가 유저 owned object를 임의로 소비할 수 없고, Claim이 자연스럽다.

### 0.2 2025-12-15: Bet Router(조회/공개) 역할 재정의

홈 “공개 피드”와 “내 베팅”은 권한/노출 필드가 다르므로 분리한다.

- **공개 피드**: `GET /api/bets/public`
  - “서버 경유로 생성/체결된 bets(D1 인덱스)”만 노출
  - 주소는 기본 마스킹(`0x12ab…89ef`) + explorer 링크 제공
- **내 베팅**: `GET /api/me/bets`
  - 인증 필수, userId는 세션에서만 결정

### 0.3 2025-12-15: 인증 일관화(보안)

**userId는 request body에서 받지 않는다.**

- 이유: body 기반 userId는 위변조 가능 → nonce 바인딩/소유권 검증이 꼬이기 쉽고 IDOR 취약점이 생긴다.
- 적용:
  - `POST /api/bets`(prepare) / `POST /api/bets/execute`
  - `POST /api/bets/claim/prepare` / `POST /api/bets/claim/execute`

---

## 1) 인증(세션) 개요

### 1.1 세션 생성

- `POST /api/auth/session`
  - 프론트에서 지갑 서명(`verifyPersonalMessageSignature`)으로 소유권을 증명
  - 서버는 `httpOnly` 쿠키 `suiAddress`를 설정한다.

### 1.2 API 호출 시

- 서버는 쿠키 `suiAddress`로 `users` 테이블을 조회해 `{ userId, suiAddress }`를 만든다.
- 구현: `lib/auth/middleware.ts#requireAuth()`

---

## 2) Sponsored Tx 공통 규칙 (Prepare/Execute)

### 2.1 Prepare

- 서버가 PTB(txBytes)를 빌드하고 `dryRun`으로 검증한다.
- 서버는 `nonce`를 발급하고 Upstash Redis에 아래 레코드를 저장한다:
  - `action` (BET/CLAIM)
  - `txBytesHash`
  - `expiresAt`
  - `betId`
  - `userId` (**중요: nonce가 유저에 바인딩됨**)

### 2.2 Execute

- 클라이언트는 `txBytes`에 지갑 서명(`userSignature`)을 하고 서버로 보낸다.
- 서버는 nonce를 `consume(getdel)`로 단일 소비한다.
- 서버는 다음을 검증한다:
  - txBytesHash 일치
  - action 일치(BET vs CLAIM)
  - expiresAt 미만
  - betId 일치
  - prepared.userId == authenticated userId
- 이후 sponsor 서명 + execute 후 `digest` 반환, objectChanges/events 파싱 후 DB 반영.

---

## 3) Bet API (쓰기 경로)

### 3.1 `POST /api/bets` — Bet Prepare

**목적**: `place_bet` Sponsored Tx를 빌드하고 `txBytes + nonce + expiresAt + betId`를 발급한다.

- **Auth**: 필요(세션)
- **Request Body**
  - `roundId` (uuid)
  - `prediction` ('GOLD' | 'BTC')
  - `amount` (int)
  - `userDelCoinId` (Sui object id)
  - `userAddress`는 보내더라도 서버가 **세션 주소로 덮어쓰거나 일치 검증**한다.
- **Response**
  - `{ betId, txBytes(base64), nonce, expiresAt }`

> 주의: prepare 단계에서 D1에는 `bets` row가 `PENDING`으로 생성된다(체인 실행 전).

### 3.2 `POST /api/bets/execute` — Bet Execute

**목적**: prepare에서 받은 tx를 체인에 실행하고, 성공 시 `bets.suiTxHash`/`bets.suiBetObjectId`를 저장한다.

- **Auth**: 필요(세션)
- **Request Body**
  - `betId` (uuid)
  - `txBytes` (base64)
  - `userSignature` (base64)
  - `nonce`
  - **`userId`는 더 이상 받지 않는다.** (서버가 세션에서 결정)
- **Response**
  - `{ digest, betObjectId }`

**DB 반영(Execute 성공 후)**

- `bets.chainStatus=EXECUTED`
- `bets.suiTxHash=digest`
- `bets.suiBetObjectId=objectChanges에서 파싱한 Bet object id`
- 라운드 풀/유저 밸런스는 오프체인 표시용으로 batch update(atomic)한다.

---

## 4) Claim API (배당/환불)

### 4.1 `POST /api/bets/claim/prepare` — Claim Prepare (A안)

**목적**: `claim_payout(poolId, settlementId, betObjectId, clock)` PTB를 서버가 빌드한다.

- **Auth**: 필요(세션)
- **Request Body**: `{ betId }`
- **Response**: `{ txBytes, nonce, expiresAt }`

**A안 핵심**

- `betObjectId`는 유저 입력이 아니라 서버가 DB에서 조회한다(`bets.suiBetObjectId`).
- 서버는 `betId → (betObjectId, round.poolId, round.settlementId)`를 조합해 tx를 만든다.

### 4.2 `POST /api/bets/claim/execute` — Claim Execute

- **Auth**: 필요(세션)
- **Request Body**: `{ betId, txBytes, userSignature, nonce }`
- **Response**: `{ digest, payoutAmount }`

**DB 반영(Execute 성공 후)**

- `bets.suiPayoutTxHash=digest`
- `bets.payoutAmount`, `bets.resultStatus` (WON/LOST/REFUNDED)
- `bets.settlementStatus=COMPLETED`

---

## 5) Bet 조회 API (읽기 경로)

### 5.1 `GET /api/bets/public` — 홈 공개 피드

- **Auth**: 불필요
- **노출 필드(현재 구현)**:
  - bet: `id, roundId, prediction, amount, createdAt, chainStatus, resultStatus, settlementStatus, payoutAmount`
  - on-chain verify key: `suiTxHash, suiBetObjectId, suiPayoutTxHash`
  - bettor: `suiAddressMasked`, `nickname`

> 참고: 이 피드는 “서버 경유 체결”만 포함한다(직접 체인 호출로 생성된 Bet은 인덱싱하지 않음).

### 5.2 `GET /api/me/bets` — 내 베팅 목록

- **Auth**: 필요(세션)
- **Query**: 기존 `/api/bets`와 동일한 필터(단, userId는 받지 않음)
- **동작**: 세션의 userId로만 필터링한다.

### 5.3 (Legacy) `GET /api/bets`

현재는 호환을 위해 유지하지만,

- `userId` query가 있으면 **반드시 로그인 + userId==session.userId**만 허용한다.
- 장기적으로는 “공개 피드/내 베팅” 분리 완료 후 사용처를 제거/정리하는 것을 권장한다.

---

## 6) Recovery API (운영자/크론 전용)

### 6.1 `POST /api/bets/recover`

- cron secret 인증 필요
- 체인 tx 조회로 `bets.suiBetObjectId` 등 누락 키를 보정한다.

### 6.2 `POST /api/bets/claim/recover`

- cron secret 인증 필요
- claim tx 조회로 `payoutAmount/resultStatus` 등을 보정한다.

---

## 7) “어디서 쓰나?” (사용처)

- **프론트**
  - 베팅 버튼: `POST /api/bets` → 지갑 서명 → `POST /api/bets/execute`
  - 라운드 종료 후: `POST /api/bets/claim/prepare` → 지갑 서명 → `POST /api/bets/claim/execute`
  - 홈: `GET /api/bets/public`
  - 내역: `GET /api/me/bets`
- **운영/크론**
  - 복구: `POST /api/bets/recover`, `POST /api/bets/claim/recover`
