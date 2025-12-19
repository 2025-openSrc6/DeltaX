# Bet 온체인 통합 플로우 정리 (2025-12)

## 현재 상태

- 프런트 흐름: `/api/sui/bet/prepare` → 지갑 `signTransactionBlock` → `/api/sui/bet/execute`.
- `/api/bets` POST는 오프체인 DB 베팅 생성용으로 남아 있어 온체인 흐름과 분리됨.
- `SuiService`:
  - `prepareBetTransaction`: 입력 검증 → tx 빌드 → 가스 세팅 → 드라이런 → nonce/해시 저장 → `txBytes/nonce/expiresAt` 반환.
  - `executeBetTransaction`: nonce 단일 소비(getdel) → tx 해시/만료/bet/user 검증 → 스폰서 서명+실행 → on-chain success 확인 → `bets.suiTxHash` 업데이트.
- `BetService`: 라운드/시간/금액 검증 후 베팅 row 생성 및 풀 업데이트(오프체인 흐름 기준).

## 목표

- 프런트가 `/api/bets` 한 번 호출로 “베팅 생성 + Sui 준비(txBytes/nonce)”를 받고, 이후 지갑 서명 → `/api/sui/bet/execute`만 호출하도록 단순화.
- 기존 도메인 검증(`BetService`)을 그대로 활용하면서 온체인 준비 단계를 한 곳에서 오케스트레이션.
- 중복 API 호출/흐름 분산을 줄이고 상태 일관성을 확보.

## 책임 분리

- `/api/bets` POST (프런트 진입점, 통합 엔드포인트):
  1. `BetService`로 베팅 생성(상태 예: `pending_chain`) — 라운드/시간/금액 검증 포함.
  2. `SuiService.prepareBetTransaction` 호출로 `txBytes/nonce/expiresAt` 생성.
  3. 응답: `{ betId, txBytes, nonce, expiresAt }` (프런트는 바로 서명/execute 단계로 이동).
- `/api/sui/bet/execute`: 지갑 서명+스폰서 서명으로 실행, on-chain success 확인 후 `bets.suiTxHash` 및 베팅 상태를 `confirmed_onchain` 등으로 갱신.
- `SuiService`: 트랜잭션 빌드/가스/드라이런/nonce 저장 + 실행/온체인 확정/DB 업데이트.
- `BetService`: 도메인 검증과 베팅 row 생성 책임을 유지(온체인용 진입점을 별도로 두거나 파라미터로 분기).

## 수정 예정 플로우

1. `/api/bets` POST 확장 (또는 `/api/bets/sui` 신설):
   - 요청 → `BetService`로 베팅 생성(`pending_chain` 상태).
   - 생성된 `betId`를 이용해 내부에서 `SuiService.prepareBetTransaction` 실행.
   - 응답으로 `betId`, `txBytes`, `nonce`, `expiresAt` 반환.
2. 프런트:
   - `/api/bets` 호출 → `txBytes`로 지갑 `signTransactionBlock` → `/api/sui/bet/execute` 호출.
3. 실행 후:
   - `executeBetTransaction` 성공 시 베팅 상태 `confirmed_onchain`(명칭 협의)로 전환하고 `suiTxHash` 저장.
   - 필요 시 라운드 풀/집계 업데이트를 이 단계에서 반영(정책에 따라 결정).

## 메모/정책 포인트

- 재-prepare 정책: `suiTxHash` 비어 있고 nonce 만료/소비된 경우 동일 betId로 새 nonce 허용 여부 결정.
- 실패 복구: execute에서 DB 업데이트 실패 시 digest 로그 기반 복구/잡 경로 마련.
- `/api/sui/bet/prepare` 라우트는 백오피스/디버그 용도로 유지 가능하나, 프런트는 통합된 `/api/bets`만 사용.

## Sui 래퍼 함수 제안 (베팅/라운드)

- 위치 제안: `lib/sui/` 아래 도메인별 빌더/실행 유틸을 분리한다.

1. 베팅
   - `lib/sui/builder.ts` (기존): place_bet PTB 빌더 유지.
   - 실행은 `SuiService.executeBetTransaction`에 이미 포함 → 추가 래퍼 불필요.

2. 풀 생성/라운드 오픈 (cron Job 2)
   - 새 파일: `lib/sui/pool.ts`
     - `buildCreatePoolTx(params: { adminCapId: string; roundId: number; lockTimeSec: number; endTimeSec: number; })`
     - `createPoolOnSui(params, sponsorOrAdminKey: Keypair)` → 트랜잭션 빌드 + 가스 세팅 + 서명/실행 + digest/objectId 반환
   - 크론에서 사용: 라운드 읽기 → `createPoolOnSui` → D1 라운드에 `suiPoolAddress` 저장.

3. 풀 잠금 (cron Job 3)
   - `lockPoolOnSui(params: { adminCapId: string; poolId: string; })` (동일 파일 `pool.ts`에 위치)
   - 빌더 + 실행 포함, 실패 시 에러/재시도 가능하게 반환.

4. 정산/배당 (cron Job 4/5)
   - 새 파일: `lib/sui/settlement.ts`
     - `finalizeRoundOnSui(params: { adminCapId: string; poolId: string; goldStart: number; goldEnd: number; btcStart: number; btcEnd: number; })` → digest + settlementId 반환
     - `distributePayoutOnSui(params: { adminCapId: string; poolId: string; settlementId: string; betObjectId: string; })` → digest 반환
   - 크론에서 사용: settle → payout 루프에서 호출, D1 업데이트와 연결.

5. 공통 유틸
   - 가스: `getGasPayment` 재사용.
   - 온체인 확정: `ensureOnChain` 패턴 재사용(성공/실패 분기 포함).

이렇게 분리하면 크론/서비스가 필요한 Sui 호출을 명확한 함수로 재사용하고, 가스/서명/에러 처리를 일관되게 유지할 수 있다.
