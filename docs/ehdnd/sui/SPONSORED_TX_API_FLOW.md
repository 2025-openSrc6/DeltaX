# Sponsored TX API 플로우 (유저 서명 + 스폰서 가스)

## 목적/전체 그림

- 목표: 유저가 소유한 DEL을 실제로 소비/수령하도록 하되, 가스는 스폰서(서버)가 낸다.
- 방법: 트랜잭션 블록(PTB)을 서버가 생성 → 프런트가 유저 지갑으로 서명 → 서버가 스폰서 서명/실행.
- 결과: 온체인 소유권/정산 투명성 확보 + UX는 “지갑 서명 한 번” 수준.

## 핵심 개념 요약

- PTB(Programmable Tx Block): 실행할 트랜잭션을 구성한 뒤 BCS 직렬화한 바이트(`txBytes`).
- 직렬화/서명: 서버가 만든 `txBytes`를 프런트가 서명 → 같은 `txBytes`에 스폰서가 추가 서명 → 실행.
- 서명 역할: 유저 서명 = 내 DEL 사용 허락, 스폰서 서명 = 가스 결제 허락.
- 가스: testnet SUI를 스폰서 계정이 보유/결제. 조회 RPC는 가스 불필요.
- 리플레이 방지: `nonce` + `expiresAt`를 부여하고 서버가 검증.

## 엔드투엔드 해피 패스

1. 서버 API(준비): PTB를 빌드 → `txBytes`(base64), `nonce`, `expiresAt` 반환.
2. 프런트: 지갑(Wallet Kit 등)으로 `txBytes` 서명 → `userSignature` 획득.
3. 서버 API(실행): `txBytes` + `userSignature`(+ nonce) 수신 → 스폰서 서명 추가 → 실행.
4. 서버: `txDigest`/상태를 DB 기록, 프런트에 반환 → UI에서 결과 표시.

## API 스펙(예시)

- 준비 API: `POST /api/sui/bet/tx`
  - Request: `{ "poolId": 123, "amount": "100000000000" }`
  - Response: `{ "txBytes": "<base64>", "nonce": "<uuid>", "expiresAt": 1710000000000 }`
- 실행 API: `POST /api/sui/bet/execute`
  - Request: `{ "txBytes": "<base64>", "userSignature": "<base64>", "nonce": "<uuid>", "publicKey": "<optional>" }`
  - Response: `{ "txDigest": "...", "status": "success" }`
- 프런트는 받은 `txBytes`를 변형하지 않고 서명만 수행. 서버는 `nonce`/`expiresAt`/비즈니스 키(poolId 등)로 검증.

## 프런트 구현 체크리스트

- 지갑 연결: testnet 고정.
- 서명: `signTransactionBlock({ transactionBlock: txBytes })`로 유저 서명만 수행(실행 X).
- 서버 호출: 준비 API → 지갑 서명 → 실행 API 순서 고정. 실패 시 재발급 요청/서명 취소 처리.
- UX: 네트워크 mismatch 경고, 서명 거부/만료/실행 실패 상태 표시. 성공 시 `txDigest`/“내 베팅” 갱신.

## 백엔드(lib/sui) 구현 체크리스트

- PTB 빌더: 베팅/정산/민트별로 패키지ID/모듈/함수/인자 설정, gasBudget 포함. 베팅 시 유저 소유 `Coin<DEL>`을 소비하도록 작성.
- 스폰서 서명: `.env`의 `SUI_SPONSOR_PRIVATE_KEY`로 `txBytes` 서명.
- 실행: `executeTransactionBlock(txBytes, [userSig, sponsorSig], …)` 호출, 결과 파싱.
- 검증: `nonce`/`expiresAt`, pool_id/round_id 일치, `txBytes` 해시 검증(서버가 만든 것과 동일한지).
- 가스/모니터링: 스폰서 SUI 잔액 임계치 체크, 부족 시 알람/차단.
- 로깅/영속화: txDigest ↔ 도메인 키(round_id, bet_id 등) 저장, 실패 시 재시도 정책 정의.

## 환경변수/설정

- `SUI_RPC_URL` (testnet)
- `SUI_PACKAGE_ID`
- `SUI_SPONSOR_PRIVATE_KEY`
- 필요 시: `SUI_ADMINCAP_ID`, `SUI_TREASURY_CAP_ID` (관리자 객체)

## 실패/예외 처리

- 서명 거부/만료: 프런트가 재발급 요청, 서버는 오래된 `nonce` 거절.
- 비즈니스 창 닫힘: lock_time 이후 베팅, end_time 이전 정산은 서버가 사전 차단.
- 가스 부족: 스폰서 잔액 부족 시 즉시 실패/알람, 자동 리트라이 금지.
- 체인 충돌: shared object 버전 충돌 시 PTB 재빌드+재서명 후 재시도.

## 컨트랙트 매핑 메모

- `betting::place_bet`: 유저 소유 `Coin<DEL>` 필요 → 유저 서명 필수. Bet 객체는 유저 소유(커스텀 객체라 지갑 기본 UI에 안 보일 수 있음).
- `betting::finalize_round`: AdminCap 요구, 스폰서 단독 서명/가스 가능.
- `betting::distribute_payout`: 반환된 `Coin<DEL>`을 유저에게 transfer해야 지갑에 DEL 표시.
- `del::mint`: TreasuryCap 보유 계정이 발행, 수신자가 유저면 지갑에 DEL 자산/트랜잭션 표시.

## 왜 이렇게 나누나(의사결정 스냅샷)

- “유저 DEL로 베팅”을 유지하려면 유저 서명이 필수. 스폰서 가스만으로 소유권 위임은 불가.
- 프런트는 서명만, 서버는 빌드/검증/가스/실행을 맡아 책임 분리가 명확.
- DEL을 없애고 기록만 남기면 web2.5가 되어 소유권/정산 투명성이 줄어듦. 본 문서는 DEL 유지 + web3 모델을 전제로 함.
