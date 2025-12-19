# Sui 베팅 에러 핸들링 가이드 (2025-12 기준)

## 범주 정리

- 입력/비즈니스 검증: 스키마(zod), 베팅/사용자 바인딩, 만료, 해시 불일치, 중복 실행.
- 체인 준비: 드라이런 실패(컨트랙트/잔액/락 상태 등), 가스 코인 부족.
- 체인 실행: RPC 타임아웃/429, 체인 실패(effects.status.failure), tx 미전파.
- 인프라: Redis(prepare 저장/consume), DB 업데이트, 환경 변수 누락.

## 에러 코드/응답 전략

- 공통: `BusinessRuleError(code, message, meta)` 사용, HTTP는 4xx(클라이언트), 5xx(인프라/RPC).
- 클라이언트 표시용 메시지는 짧게, 원인 분석용 메타( digest, betId, userId, nonce, poolId, prediction, rpcUrl )는 로그로 남김.

### 입력/비즈니스

- INVALID_NONCE / NONCE_EXPIRED: 400, 재시도 유도(prepare 다시 호출).
- TX_MISMATCH: 400, “서명한 txBytes가 준비된 것과 다릅니다”.
- BET_MISMATCH / USER_MISMATCH: 400, 인증/바인딩 확인.
- VALIDATION_ERROR (zod): 400, 필드별 메시지 포함.

### 체인 준비 (prepare)

- SUI_DRY_RUN_FAILED: 400, `effects.status.error`를 그대로 메타에 포함. 프런트에 “드라이런 실패: {error}”.
- GAS_EXHAUSTED / NO_GAS_COINS: 503, 스폰서 잔액 보충 필요. 로그/알람 필수.
- ENV_MISSING(SUI_RPC_URL / SUI_SPONSOR_PRIVATE_KEY): 500, 운영 대응.

### 체인 실행 (execute)

- SUI_EXECUTE_FAILED: 502/500
  - RPC 타임아웃/429: 502, digest 없으면 “전송 불확실 → 나중에 조회 필요”. digest 있으면 polling 후 처리.
  - effects.status.failure: 400/409, `status.error`를 메타로 반환, DB 업데이트 중단.
- SUI_TX_NOT_FOUND: 504, digest 반환 후 재조회 안내(네트워크 지연/전파 실패 가능).
- SIGNATURE_INVALID: 400, userSignature 형식/주소 미일치.

### 인프라

- REDIS_UNAVAILABLE / REDIS_TIMEOUT: 503, 재시도 가능 안내.
- DB_UPDATE_FAILED: 500, digest와 betId 로그 남기고 알람(체인 성공 후 DB 미반영 수동 처리 필요).

## 핸들링 플로우 베스트 프랙티스

1. prepare
   - 스키마 검증 실패 → 400 VALIDATION_ERROR.
   - 드라이런 실패 → 400 SUI_DRY_RUN_FAILED, error 그대로 반환.
   - 가스 코인 없음 → 503 NO_GAS_COINS.
   - nonce 저장 실패(Upstash) → 503 REDIS_UNAVAILABLE.
2. execute
   - nonce `getdel` 실패(없음/만료) → 400 INVALID_NONCE/NONCE_EXPIRED.
   - txBytes 해시/바인딩 불일치 → 400 TX_MISMATCH/BET_MISMATCH/USER_MISMATCH.
   - 체인 실행:
     - 성공 응답 + effects.success → DB 업데이트 후 200.
     - effects.failure → DB 미업데이트, 400/409 SUI_EXECUTE_FAILED(error=…).
     - RPC 타임아웃/429 → 502, digest 없으면 “전송 불확실” 메시지, 있으면 polling 재시도 후 최종 판단.
     - polling 실패 → 504 SUI_TX_NOT_FOUND(digest 포함) 로깅.
   - DB 업데이트 실패 → 500 DB_UPDATE_FAILED, digest/betId 로그(수동 정리 대비).

## 로깅/알람 필드

- level=error, code, digest?, betId, userId, nonce, poolId, prediction, rpcUrl, error(raw), stack, elapsed_ms.
- 체인 관련 실패는 Slack/ops 알람 대상.

## 클라이언트 UX 권장

- prepare 실패: 메시지 그대로 표시(드라이런 에러).
- execute 실패:
  - nonce/tx mismatch → “다시 시도” 안내.
  - chain failure(error 포함) → 사용자에게 컨트랙트 에러 설명.
  - 타임아웃/tx-not-found → “전송 여부 확인 중, 잠시 후 새로고침/내역 조회” 안내 + 자동 재조회 버튼.

## 참고 (2025-12 최신 Sui SDK 관찰)

- `@mysten/sui@1.44` Ed25519Keypair는 `signTransaction` 제공, `signTransactionBlock` 없음. `executeTransactionBlock` 호출은 `transactionBlock: Uint8Array` + `WaitForLocalExecution` 후 `getTransactionBlock(showEffects)`로 상태 확인.
- Redis는 `getdel` 지원하여 nonce 단일 소비 보장.
