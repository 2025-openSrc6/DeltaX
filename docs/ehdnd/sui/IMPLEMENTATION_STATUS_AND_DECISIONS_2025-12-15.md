## DeltaX Sui 정산/배당 (현 상태 + 결정사항) — 2025-12-15

작성자: 장태웅  
Last Updated: 2025-12-15

이 문서는 “이번 마일스톤에서 Sui 온체인 정산/배당을 어떻게 구현/운영할지”에 대해,
현재까지 **구현된 사항**, **결정된 사항**, **추후 구현/반영해야 할 사항**, **결정 논리**를 요약한다.

---

## 1) 목표 (이번 마일스톤)

- **온체인 기록/검증 가능성 확보**
  - 풀 생성 → 베팅 → 락 → 정산(Settlement 생성)까지는 cron(서버)로 자동화
  - 배당은 “유저가 자기 Bet 오브젝트로 Claim”하는 방식으로 정리 (best-practice)
- **오프체인(D1)과 온체인(Sui) 연결**
  - 라운드/정산 tx digest, settlement id 등 감사 가능한 키를 저장할 수 있는 형태로 진행

---

## 2) 구현된 사항 (현재 코드 기준)

### 2.1 온체인 (Move)

- **`contracts/sources/betting.move`**
  - `create_pool` / `place_bet` / `lock_pool` / `finalize_round` / `distribute_payout` 존재
  - `Settlement`을 Shared Object로 생성(영수증 개념)
  - 승자 판정 로직을 “정규화 강도(return/vol)” 기준으로 정리:
    - 나눗셈 없이 cross-multiply로 비교
  - **안전성 보강**
    - avgVol=0 방어 (`E_INVALID_AVGVOL`)
    - 수수료/배당률/배당금 계산을 u128으로 승격 후 u64 다운캐스트 가드(`E_OVERFLOW`)
    - `distribute_payout`의 잘못된 에러 네이밍을 `E_POOL_NOT_SETTLED`로 정리(값 alias 유지)
  - **신규: `claim_payout` 추가**
    - 유저가 본인 Bet(owned object)를 제출해서 payout을 claim
    - claim 시 Bet 소각 → 2회 청구 방지(멱등성)
    - payout coin은 함수 내부에서 유저에게 전송(coin dangling 방지)

### 2.2 오프체인 (Sui admin wrapper)

- **`lib/sui/admin.ts`**
  - cron/service가 호출할 “Admin 전용 Sui wrapper” 구현 완료
  - 공통 패턴:
    - 입력 검증(Zod) → u64 변환/스케일링 가드(BigInt) → tx build → dryRun → execute → on-chain 확정 → objectChanges 파싱
  - 제공 함수:
    - `createPool(roundNumber, lockTimeMs, endTimeMs) -> { poolId, txDigest }`
    - `lockPool(poolId) -> { txDigest }`
    - `finalizeRound(poolId, prices, avgVols, volMeta?) -> { settlementId, feeCoinId, txDigest }`
    - `distributePayout(poolId, settlementId, betObjectId) -> { payoutCoinId, txDigest }`
      - **주의**: 현 Move 설계(유저 소유 Bet)에서는 cron 단독 호출이 구조적으로 막힐 수 있어 “문서/주석상 TODO”로 남김
    - `mintDel(toAddress, amount) -> { txDigest }`
- **`lib/sui/validation.ts`**
  - admin wrapper 입력 스키마 추가 (가격/avgVol finite/positive + 상한, 0x id 포맷 등)
- **`lib/sui/types.ts`**
  - admin wrapper 타입 추가 (CreatePool/LockPool/Finalize/Distribute/Mint)

---

## 3) 결정된 사항 (핵심)

### 3.1 배당 모델: “유저 claim”으로 확정

- **결정**: 유저가 지갑에 보유한 `Bet` 오브젝트를 제출해서 `claim_payout` 호출
- **이유(논리)**:
  - `place_bet`가 Bet을 유저 주소로 transfer → Bet은 “유저 소유 owned object”
  - Move의 `distribute_payout`은 `bet: Bet`(owned object 소비)를 인자로 받음
  - cron(Admin)이 유저 소유 Bet을 임의로 tx 입력에 넣을 수 없음(소유자 서명/소유권 필요)
  - 따라서 배당은 “유저가 bet object를 제출”하는 claim 방식이 자연스럽고 안전함

### 3.2 승자 판정: “return/vol”를 정수 연산으로

- **결정**: avgVol을 Next(오프체인)에서 계산해 `finalize_round`에 전달
- **온체인 계산**: 나눗셈 없이 cross-multiply로 비교하여 결과만 온체인에 기록
- **이유**: on-chain에서 division/float 없이 재현 가능하고, Settlement가 “검증 가능한 영수증”이 됨

---

## 4) 아직 결정/반영이 필요한 사항 (TODO)

### 4.1 “승자 쪽에 베팅이 0”인 케이스 정책

케이스:

- 라운드에 베팅이 존재(total_pool>0)
- 그러나 승자 후보 쪽 풀(gold_pool 또는 btc_pool)이 0

문제:

- payout_ratio가 0이 되면 승자도 payout 0이 되어 자금이 락될 수 있음

필요한 운영 결정(택 1):

- **VOID 처리**: 해당 라운드를 무효로 하고 환불 플로우(온체인/오프체인 동시)
- **플랫폼 회수**: platform fee와 유사하게 남은 잔액을 admin으로 회수(투명성/정책 공지 필수)
- **Rollover**: 다음 라운드로 이월(복잡도/검증 난이도↑)

현재 상태:

- 임시 방어 로직이 존재(“베팅이 존재하는 쪽”을 winner로 강제)하나,
  이는 최종 정책 확정 후 교체/삭제해야 함.

### 4.2 `distribute_payout`(cron 일괄 배당) 경로

- 현재 Move 구조(유저 Bet 소유)에서는 cron이 각 bet을 소각/지급하는 방식이 어려움
- 만약 “완전 자동 배당(cron)”이 필요하다면 아래 중 하나를 설계 변경해야 함:
  - Bet을 서버가 소유하도록 발행(UX/보안/서명 구조 변화)
  - 유저 claim 모델 유지 + 프론트/지갑 UX를 강화(추천)

### 4.3 오프체인 저장(정산 영수증 키) 연결

필수로 D1에 저장해야 하는 값:

- round ↔ poolId
- finalize tx digest
- settlement object id
- (option) fee coin id, price/avgVol 메타 JSON

---

## 5) 환경변수(서버)

Admin wrapper(`lib/sui/admin.ts`) 실행에 필요한 env:

- `SUI_RPC_URL`
- `SUI_PACKAGE_ID`
- `SUI_SPONSOR_PRIVATE_KEY`
- `SUI_ADMIN_CAP_ID` (없으면 `SUI_CAP_OBJECT_ID` fallback)
- `SUI_TREASURY_CAP_ID` (mintDel 사용 시)

---

## 6) 계층/검증 책임 요약

- **cron route**
  - 인증/외부 데이터 fetch/응답만
- **RoundService**
  - FSM/시간/멱등성/정산 규칙/DB 저장
  - “언제 어떤 on-chain 액션을 호출할지” 결정
- **Sui admin wrapper (`lib/sui/admin.ts`)**
  - 입력 형식/범위(u64 변환 안전성) + 스케일링
  - tx build/dryRun/execute/confirm/parse
