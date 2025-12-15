# Sui fee/payout 전달 미이행 정리

## 상황 요약

- Move 스펙(`SUI_CONTRACT_SPEC.md`, `contracts/sources/betting.move`): `finalize_round`는 `(Settlement ID, Coin<DEL>)`을 반환하며 **호출자가 platform fee 코인을 Admin에게 transfer**해야 함.
- 현재 구현(`lib/sui/admin.ts`): `finalizeRound`는 fee Coin objectId만 파싱해 DB(`rounds.suiFeeCoinObjectId`)에 저장하고, 별도 transfer를 하지 않음.
- 결과: 플랫폼 수수료가 sponsor/admin 서명자 지갑에 “dangling coin”으로 남고, 스펙 상 요구된 fee 전달이 되지 않음.

## 영향

- 플랫폼 수수료 회수 미완료 → 수익·정산 불일치 위험, 지갑에 동전 누적.

## 수정 방향 (claim-only 확정)

1. **finalize_round fee 전달**
   - `lib/sui/admin.ts#finalizeRound`에서 fee coin 파싱 후 **동일 PTB 안에서 `transfer::public_transfer`로 AdminCap 보유 주소로 전송**한다.
   - 수령 주소: AdminCap 보유 계정(기본). 필요하면 `SUI_FEE_COLLECTOR_ADDRESS`로 오버라이드 가능.
   - DB에는 여전히 `suiFeeCoinObjectId`/`suiFinalizeTxDigest` 저장을 유지하되, 코인은 tx 내에서 바로 이동시켜 dangling 방지.

2. **payout은 claim-only**
   - 서버 주도 payout(`distribute_payout`) 경로는 사용하지 않는다. 래퍼/타입/validation은 제거하거나 `BusinessRuleError('DEPRECATED_PAYOUT_PATH')`로 하드 차단.
   - `RoundService.settleRound`/Job5 등 서버 주도 배당 흐름은 삭제 또는 명시적 예외 유지.

3. **운영/마이그레이션**
   - env에 fee 수령자 주소가 필요하면 추가 배포(Secrets 포함).
   - 과거 생성된 fee coin이 지갑에 남아 있다면 AdminCap 주소로 수동 정리.

## 제안 구현 스케치

- `lib/sui/admin.ts#finalizeRound`:
  - fee coin 파싱 이후 `tx.transferObjects([tx.object(feeCoinId)], tx.pure.address(adminAddress))` 추가.
  - `adminAddress`: AdminCap 보유 주소(기본) 또는 `SUI_FEE_COLLECTOR_ADDRESS`.
- `lib/sui/admin.ts#distributePayout` 및 관련 타입/validation:
  - 사용 안 함 → 삭제 또는 호출 시 `DEPRECATED_PAYOUT_PATH` 예외.
- `lib/rounds/service.ts`:
  - artifact 저장 로직 유지. fee 전달이 tx 내부에서 완료된다는 주석/로그만 보강.
- 테스트:
  - fee coin transfer 대상 주소 포함한 dryRun/execute 단위 테스트.
  - `DEPRECATED_PAYOUT_PATH` 예외 동작 확인(호출 차단 보증).

## 결정 사항

- payout은 **claim-only**. 서버 주도 배당 경로(distribute_payout)는 폐기/차단한다.
- platform fee는 finalize_round PTB 내에서 **AdminCap 주소로 즉시 전송**한다.

## 이번 수정 요약 (2025-XX)

- finalize_round PTB에 fee coin을 AdminCap 소유 주소로 `transfer::public_transfer` 하는 스텝을 추가했다. 기본 수령자는 sponsor/AdminCap 주소이며, 필요 시 `SUI_FEE_COLLECTOR_ADDRESS`로 오버라이드 가능.
- 서버 주도 payout 경로(distribute_payout) 관련 래퍼/타입/validation을 제거하여 **claim-only** 모델을 강제했다.

## 왜 이렇게 수정했나

- Move 스펙상 fee coin은 “호출자가 Admin에게 transfer” 해야 하는데, 기존 래퍼는 objectId만 저장하고 전송이 누락되어 fee가 지갑에 쌓이는 문제가 있었다.
- 베팅 시 Bet이 유저 소유 객체이므로 서버가 임의로 payout을 실행할 수 없고, UX/보안 측면에서도 claim-only가 명확하다. 불필요한 서버 주도 payout 경로를 없애 재도입 리스크를 줄였다.

## 구현/플로우

- `lib/sui/admin.ts#finalizeRound`: finalize_round 반환값에서 fee coin을 받아 PTB 내부에서 AdminCap 주소(또는 `SUI_FEE_COLLECTOR_ADDRESS`)로 즉시 `transferObjects`.
- `lib/sui/admin.ts`/`lib/sui/types.ts`/`lib/sui/validation.ts`: distribute_payout 경로 삭제로 서버 주도 payout 차단, claim-only만 유지.
- Job4 → finalize_round: Settlement 생성 + fee coin 즉시 전송 → digest/objectId를 DB에 저장. 이후 유저는 claim API로 `claim_payout`을 실행해 payout coin을 직접 수령.
