## 프론트엔드: 라운드 종료 후 배당 Claim 가이드 (Bet owned object 모델)

이 문서는 현재 온체인 모델(유저가 `Bet` 오브젝트를 소유) 기준으로,
프론트에서 “라운드 종료 후 배당을 받는 과정”을 구현하기 위한 최소 가이드다.

---

## 1) UX 목표

- 유저가 “내 라운드 결과/정산(Settlement)”을 확인하고
- 본인 지갑에 남아있는 `Bet` 오브젝트로
- `claim_payout(pool, settlement, bet)`을 호출해
  - 승자면 DEL 지급
  - 패자여도 Bet 소각(정리)

---

## 2) 프론트가 알아야 하는 3가지 Object ID

`claim_payout` 실행에 필요한 핵심 인자:

- **`poolId`**: 해당 라운드의 `BettingPool` shared object id
- **`settlementId`**: 해당 라운드의 `Settlement` shared object id (정산 영수증)
- **`betObjectId`**: 유저가 소유한 `Bet` owned object id

`poolId`, `settlementId`는 보통 **서버(DB)**가 라운드 데이터로 노출해줘야 한다.
(`GET /api/rounds` 같은 라운드 조회 응답에 포함시키는 형태 권장)

---

## 3) “내 Bet 오브젝트”를 지갑에서 찾는 방법(개념)

프론트는 지갑 주소로 “유저가 소유한 Sui objects”를 조회해
타입이 `...::betting::Bet` 인 오브젝트를 찾는다.

그리고 다음 기준으로 “어느 라운드 Bet인지” 매칭한다:

- **권장(확실)**: Bet object의 `pool_id`(필드)를 읽어서 라운드의 `poolId`와 매칭
- **대안(약함)**: 오프체인에서 bet↔round 매핑을 별도로 저장하고, 그 키로 betObjectId를 찾기

---

## 4) Claim 트랜잭션을 어떻게 만들까?

### 4.1 일반 트랜잭션(유저가 가스비도 지불)

- 유저 지갑이 tx를 구성/서명/실행
- `moveCall(target: <PACKAGE>::betting::claim_payout, args: [poolId, settlementId, betObjectId, clock])`

### 4.2 Sponsored Tx(권장: 유저 가스 부담 0)

현재 코드베이스는 “Sponsored tx(서버 스폰서 가스)” 패턴이 이미 있으므로,
Claim에도 동일 패턴을 적용할 수 있다.

개략:

- 프론트가 “claim tx bytes”를 서버에서 발급받고
- 유저가 지갑으로 서명한 뒤
- 서버가 sponsor 서명 + execute

이때도 중요한 점:

- **Bet object는 유저 소유**이므로 유저 서명은 필수
- 서버 단독으로는 claim 불가능

---

## 5) 버튼/상태 처리(권장)

- “Claim 가능” 조건(프론트 기준):
  - 라운드에 `settlementId`가 존재(= finalize 완료)
  - 유저가 `Bet` 오브젝트를 보유하고 있으며, 그 Bet의 `pool_id`가 해당 라운드 `poolId`와 일치
- “이미 Claim 했음” 판단:
  - Bet은 claim 시 소각되므로, 해당 Bet object가 더 이상 지갑에 없으면 완료로 간주 가능
  - (옵션) 오프체인에 claim tx digest를 저장해 표시할 수도 있음

---

## 6) 추후(선택) — 서버가 일괄 배당하는 모델과의 차이

현재 모델은 “유저 claim”을 전제로 한다.
만약 “서버 cron이 모든 bet을 순회해 자동 배당”을 원한다면,
Bet 소유권 모델 자체를 바꿔야 하며(유저 owned -> server owned 등),
UX/보안/서명 플로우가 크게 바뀐다.
