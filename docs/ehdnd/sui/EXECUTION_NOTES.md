# Sui 베팅 실행 관련 고민/이슈 정리

## 1) transactionBlock lint 이슈 & SDK 버전

- 현재 `@mysten/sui` 2024 계열에서는 `Transaction`(`@mysten/sui/transactions`)과 `TransactionBlock`(`@mysten/sui.js/transactions`)이 공존합니다. 우리 코드는 `Transaction`을 쓰고 있어요.
- 빌드된 `txBytes`를 스폰서가 서명할 때는 **`signTransactionBlock`**을 사용해야 합니다. (`signTransaction`은 오래된 API)
- ESLint가 `transactionBlock` 옵션에 대해 경고를 냈다면, SDK 타입 정의가 업데이트된 것이니 `executeTransactionBlock({ transactionBlock: txBytes, ... })` 시그니처는 맞습니다. 다만 서명 함수만 최신 것으로 맞추면 됩니다.

## 2) 온체인 성공 판정 베스트 프랙티스

- `requestType: 'WaitForLocalExecution'` + 추가 폴링(`getTransactionBlock`)으로 전파 상태를 확인합니다.
- 폴링 시 `showEffects`를 요청해 `effects.status.status === 'success'`를 반드시 체크하고, 실패 시 `effects.status.error`를 그대로 로깅/응답에 포함하세요.
- 가능하면 도메인 이벤트(예: Move 이벤트 타입) 유무를 함께 확인하여 “의도한 실행”을 보강 검증합니다.
- 실패/타임아웃 케이스에서도 `digest`를 남겨 후속 재조회를 가능하게 하고, DB 업데이트는 `success` 확정 후에만 수행합니다.

## 3) Redis 동시성(Nonce) 보장

- 준비 단계에서 저장한 nonce는 **원샷으로만 소비**되어야 합니다.
- Upstash에서는 `GETDEL`(or `getdel`)을 사용해 원자적으로 조회+삭제를 해야 중복 실행을 막을 수 있습니다. 지원이 안 되는 환경이면 Lua 스크립트나 `multi/exec`로 `GET`→`DEL`을 한 트랜잭션으로 묶으세요.
- 실패/만료 시에는 “이미 사용/만료” 에러를 명확히 반환하고, 재시도를 안내합니다.

## 4) 가스 코인 페이지네이션

- `getCoins` 기본 호출은 첫 페이지(50개)만 가져옵니다. 스폰서 코인이 많을 때 후속 페이지를 안 보면 “가스 없음”으로 잘못 실패할 수 있습니다.
- 전략: `while (cursor)`로 페이지를 순회하며 `GAS_BUDGET` 이상 코인을 누적 → 하나 랜덤 선택. 또는 충분히 많아질 때 조기 종료.
- 추가로, 메인넷 전환 시 `gasPrice`는 `getReferenceGasPrice()`로 갱신하고 버짓도 재평가하세요.

## 5) 에러 처리 가이드

- 분류: (1) 입력/비즈니스 오류(검증, nonce/해시 불일치, 만료), (2) 체인 실행 실패(드라이런 실패, `effects.status.error`), (3) 인프라 오류(RPC 타임아웃, Redis/D1), (4) 알 수 없는 예외.
- 공통 원칙:
  - 가능한 한 `digest`와 원본 `error` 메시지를 남겨서 재조회를 용이하게 한다.
  - 클라이언트에는 비즈니스 코드(`SUI_DRY_RUN_FAILED`, `TX_MISMATCH`, `SUI_EXECUTE_FAILED`, `SUI_TX_NOT_FOUND` 등)를 함께 내려 재시도/문의 흐름을 정리한다.
  - 인프라/타임아웃의 경우 재시도 가능 여부를 명시하고, 이미 전송된 트랜잭션일 수 있음을 안내한다.
- 로깅/알람: 실패 시 `digest`, `betId`, `userId`, `nonce`, `poolId`, `prediction`을 structured log로 남겨 수동 정리/재처리를 가능하게 합니다.
