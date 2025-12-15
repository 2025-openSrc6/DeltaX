# Sui 래퍼 구현 플랜 (관리자/크론 전용)

작성 목적: `lib/sui/repository.ts`로 create/lock/finalize/payout/mint 래퍼를 추가하기 전에, 남은 결정사항을 모으고 구현 단계를 명확히 하기 위함.

## 1) 남은 결정 포인트 + 방향/이유/조언

- `finalize_round` 입력/시그니처
  - 고민: avgVol 2개 스케일(`% * 10_000` 가정)과 메타 전달 방식(개별 필드 vs JSON string). Move 시그니처가 고정돼야 래퍼 인자/파서 확정.
  - 조언/베스트: avgVol은 `% * 10_000`(0.0001%)로 고정, 메타는 필드 분리(`vol_window_days`, `vol_sampling`, `vol_source`, `vol_method_version`)를 Move struct에 추가. 이유: 온체인 재현성과 검증 용이, JSON blob은 파싱 비용/타입 안전성 떨어짐.
  - 결정 제안: 필드 분리 + 스케일 `% * 10_000` 채택.
- Settlement 메타 저장(온/오프 체인)
  - 고민: 온체인 필드 vs blob, D1에 avgVol 메타 저장 위치.
  - 조언/베스트: 온체인 필드 분리(위 제안) + D1에는 `rounds`에 `price_snapshot_meta`와 별도로 `avgVolMeta` 컬럼(또는 JSON text) 추가. 이유: 온/오프 체인 모두 감사 가능해야 함, 메타를 데이터와 함께 저장해야 재계산/검증 가능.
  - 결정 제안: 온체인 필드, 오프체인 `avgVolMeta` JSON text 추가.
- Admin/Treasury 식별자 & 서명자
  - 고민: env 키 네이밍(`SUI_ADMIN_CAP_ID`/`SUI_TREASURY_CAP_ID` vs `SUI_CAP_OBJECT_ID`), 가스 계정과 AdminCap 보유 계정이 동일한지.
  - 조언/베스트: 명시적 키(`SUI_ADMIN_CAP_ID`, `SUI_TREASURY_CAP_ID`) 사용. 가스/서명 계정은 AdminCap 계정과 동일하게 시작하고, 분리 필요 시 후속 옵션으로 admin 전용 키 로드 분기 추가. 이유: 오해 방지, 단일 계정이 초기 복잡도 최소.
  - 결정 제안: `SUI_ADMIN_CAP_ID`/`SUI_TREASURY_CAP_ID`로 고정, 가스=Admin 단일 계정.
- 오버플로/스케일 방어
  - 고민: 가격(\*100) × avgVol × startPrice 곱 시 u64 초과 가능.
  - 조언/베스트: 입력 상한을 오프체인에서 강제(예: 가격 < 1e8, avgVolScaled < 1e7) 후 Move에서도 assert로 가드. 실패 시 VOID 처리. 이유: on-chain abort보다 사전 필터가 안전, 재현성 확보.
  - 결정 제안: 오프체인 상한 + Move assert 둘 다 적용.
- fee/payout Coin 전달 책임
  - 고민: `finalize_round` fee Coin을 누구/언제 transfer, `distribute_payout` 반환 Coin을 바로 유저로 보낼지.
  - 조언/베스트: 크론이 즉시 Admin 주소로 fee transfer, payout Coin은 크론이 바로 유저로 transfer(추가 tx)하거나 동일 tx에서 `transfer::public_transfer`까지 수행하는 래퍼 옵션 제공. 이유: 체인에 남는 Coin을 최소화해 dangling object 방지.
  - 결정 제안: 1) finalize 직후 fee transfer 실행, 2) payout은 래퍼에서 바로 transfer to user(추가 moveCall)까지 포함하는 버전 우선.
- 멱등성/재시도
  - 고민: 이미 LOCKED/SETTLED 상태일 때 on-chain abort vs 오프체인 단락.
  - 조언/베스트: 오프체인에서 상태 확인 후 단락, 그래도 호출됐다면 on-chain abort를 `409`로 매핑. 재시도는 idempotent guard로 최소화. 이유: 비용 절감 + 명확한 실패 카테고리.
  - 결정 제안: 오프체인 선제 단락 + abort 매핑 `ROUND_NOT_READY/ALREADY_DONE`로 구분 로깅.
- 데이터 부족/0 avgVol
  - 고민: <360 포인트 또는 0일 때 처리.
  - 조언/베스트: 스펙 §4대로 VOID 처리 또는 라운드 취소, 기본값 사용 금지. 이유: 정산 공정성/검증성 유지.
  - 결정 제안: 부족/0이면 finalize/payout 스킵하고 라운드 VOID로 마킹.

## 2) 구현 범위/단계 (래퍼 중심)

1. Env/Config 정비
   - `lib/sui/config.ts`(또는 `lib/env.ts` 보강)에서 `SUI_PACKAGE_ID`, `SUI_RPC_URL`, `SUI_ADMIN_CAP_ID`(`SUI_CAP_OBJECT_ID`), `SUI_TREASURY_CAP_ID`, `SUI_SPONSOR_PRIVATE_KEY` 필수 검증.
   - `lib/sui/constants.ts`에 `CLOCK_OBJECT_ID='0x6'`, `PRICE_SCALE=100`, `AVG_VOL_SCALE=10_000` 추가.
2. 공통 실행 헬퍼
   - 가스 선택 `getGasPayment` 재사용, `suiClient`/`getSponsorKeypair` 사용.
   - `executeWithDryRun(tx)` 유틸: 빌드 → dryRun 실패 시 `SUI_DRY_RUN_FAILED` → execute(`WaitForLocalExecution`) → `ensureOnChain` 재사용.
   - `extractCreatedObject(objectChanges, typeSuffix)` 등 파서로 Pool/Settlement/Coin ID 추출.
3. PTB 빌더 (관리자 전용 함수)
   - `buildCreatePoolTx(adminCapId, roundId, lockTimeMs, endTimeMs)` → `betting::create_pool`.
   - `buildLockPoolTx(adminCapId, poolId)` → `betting::lock_pool` + Clock.
   - `buildFinalizeRoundTx(adminCapId, poolId, prices, avgVols, volMeta)` → 가격/avgVol 스케일 적용 후 Move 호출.
   - `buildDistributePayoutTx(adminCapId, poolId, settlementId, betObjectId)` → Clock 포함.
   - `buildMintDelTx(treasuryCapId, toAddress, amount)` → `del::mint`.
4. 공개 래퍼 (`lib/sui/repository.ts`)
   - `createPool(...) -> { poolId, txDigest }` (objectChanges에서 BettingPool ID 파싱).
   - `lockPool(poolId) -> { txDigest }`.
   - `finalizeRound(...) -> { settlementId, feeCoin?, txDigest }` (Settlement ID 및 fee Coin objectId 추출).
   - `distributePayout(...) -> { payoutCoin?, txDigest }`.
   - `mintDel(...) -> { coinObjectId, txDigest }`.
   - 모든 함수에서 입력 Zod 검증(suiIdSchema 등), `BusinessRuleError` 코드 체계 재사용.
5. 테스트
   - 단위: `suiClient/getGasPayment/getSponsorKeypair` 모킹, 빌더 target/인자/가스 설정 검증, object 파싱 검증, dryRun/execute 실패 시 코드 매핑 검증.
   - (옵션) env 있을 때 통합 테스트 스켈레톤만 `describe.skip`으로 추가.

## 3) 구현 전 확정 필요 체크리스트

- Move `finalize_round` 최종 시그니처와 Settlement 필드(메타 포함) 확정.
- avgVol 스케일/단위(0.0001% 단위 가정)와 오버플로 방어 입력 범위.
- env 키 네이밍(`SUI_ADMIN_CAP_ID` vs `SUI_CAP_OBJECT_ID`) 및 AdminCap/가스 계정 동일 여부.
- fee/payout Coin을 언제/누가 transfer할지 운영 플로우.
- 멱등성/재시도 정책(온체인 에러 vs 오프체인 선제 단락).

## 4) 권장 사항 / 베스트 프랙티스

- 가스/동시성: Split Gas(랜덤 가스 코인) 유지, `WaitForLocalExecution` 후 `getTransactionBlock`으로 확정. 가스 부족 시 별도 알람 코드(`NO_GAS_COINS`) 유지.
- 스케일링 안전: 모든 입력을 스케일 변환 전에 `Number.isFinite`+`>=0` 검증, u64 상한(예: 1e15 미만)으로 컷오프해 Move 오버플로 예방.
- 에러 표준화: `ERROR_HANDLING.md` 코드 재사용, Move abort 메시지를 메타로 포함해 재시도 가능/불가 구분(log category `rate_limit`/`timeout`/`rpc`).
- 멱등성: 이미 LOCKED/SETTLED일 때는 오프체인에서 단락하거나 온체인 에러를 `409`로 매핑, 크론 재시도 안전하게.
- 파싱 신뢰성: `objectChanges`에서 타입 접미사(`::betting::BettingPool`, `::betting::Settlement`, `coin::Coin<...del::DEL>`)로 필터링; 실패 시 `SUI_PARSE_FAILED`로 중단.
- 모니터링: txDigest, poolId/settlementId, roundId, rpcUrl, gasCoinId를 로깅; rate limit/timeout은 백오프 재시도(지수/상한) 적용.
- 서명자 일관성: AdminCap 보유 계정과 가스 계정이 같을 때만 단일 서명; 분리 시 admin 키 추가 로드 분기(추후 대비).
