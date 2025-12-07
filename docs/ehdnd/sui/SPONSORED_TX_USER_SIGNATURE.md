# Sponsored TX + User Signature 플로우 정리

## 목차

- 배경/결정 근거
- 핵심 개념(직렬화/서명/가스)
- 해피 패스 E2E 플로우
- 프런트 구현 체크리스트
- 백엔드(lib/sui) 구현 체크리스트
- 환경변수/설정
- 실패/예외 처리 가이드
- 컨트랙트 매핑(베팅/정산/민트)
- TODO/오픈 이슈

## 배경/결정 근거

- 유저가 가진 DEL을 실제로 사용하려면 해당 코인 소유자 서명이 필수.
- 스폰서(서버)가 가스를 대주더라도, 코인 소비 권한은 유저 서명으로만 확보 가능.
- 커스터디 모델(서버 예치)보다 유저 서명 모델이 소유권/투명성/신뢰 측면에서 낫고, UX는 “지갑으로 한 번 서명” 수준.

## 핵심 개념(직렬화/서명/가스)

- PTB(Programmable Tx Block): 실행할 트랜잭션을 구성한 뒤 BCS 직렬화한 바이트(`txBytes`). 누구나 같은 `txBytes`에 서명 가능.
- 서명 분리: 유저 서명 → “내 DEL을 써도 된다” 허락, 스폰서 서명 → “가스는 내가 낸다” 허락.
- 가스: testnet SUI를 스폰서 계정이 보유하고 결제. 조회 RPC는 가스 불필요.

## 해피 패스 E2E 플로우

1. 서버(lib/sui)가 PTB 생성: 패키지ID/모듈/함수/인자 포함 → BCS 직렬화해 `txBytes` 준비.
2. 서버 → 프런트: `txBytes`(base64) 전달.
3. 프런트: 지갑(Wallet Kit 등)으로 `txBytes`에 유저 서명 → `userSignature` 획득.
4. 프런트 → 서버: `txBytes` + `userSignature` POST.
5. 서버: 동일 `txBytes`에 스폰서 키로 서명 → `executeTransactionBlock(txBytes, [userSignature, sponsorSignature], …)` 호출.
6. 서버: `txDigest`와 상태를 DB 기록, 실패 시 리트라이/알림.
7. 프런트/UI: 결과/txDigest를 표시. 베팅/정산 결과는 체인 이벤트 or DB를 통해 조회.

프런트가 PTB를 직접 만들고 서버는 실행만 하는 패턴도 가능하지만, 비즈니스 로직 검증/고정이 필요하므로 “서버 PTB 빌드”가 기본 추천.

## 프런트 구현 체크리스트

- Wallet Kit(또는 호환 지갑) 연동: testnet 고정.
- `signTransactionBlock({ transactionBlock: txBytes })` 호출로 유저 서명만 수행(가스는 서버가 낼 것이므로 execute까지 하지 않음).
- 서버로 돌려줄 페이로드 예시:

```json
{
  "txBytes": "<base64>",
  "userSignature": "<base64>",
  "publicKey": "<optional, 지갑이 제공하면 그대로>"
}
```

- UX: “베팅 진행” 클릭 → 지갑 서명 모달 → 성공 시 결과 화면/대기 상태 표시.
- 오류 처리: 서명 거부, 네트워크 mismatch(testnet), 만료된 `txBytes` 재발급 요청.

## 백엔드(lib/sui) 구현 체크리스트

- PTB 빌더(베팅/정산/민트 각각): 패키지ID/모듈/함수/인자, gasBudget 설정. 베팅 시 `Coin<DEL>` 입력을 유저 소유로 지정해야 함(유저가 선택한 코인 object IDs 필요).
- `signWithSponsor(txBytes)`: `.env` 스폰서 프라이빗 키로 서명.
- `executeWithSponsor(txBytes, userSignature)`: 두 서명 합쳐 `executeTransactionBlock` 호출, txDigest/효과 파싱 반환.
- 스폰서 잔액 체크: tx 실행 전 SUI 잔액 최소치 확인, 부족 시 알람.
- 로깅/영속화: txDigest, round_id/bet_id 등 도메인 키와 매핑, 실패 시 리트라이 정책.
- 입력 검증: 서버가 빌드한 `txBytes`만 받도록 nonce/round_id 검증(리플레이 방지).

## 환경변수/설정

- `SUI_RPC_URL` (testnet)
- `SUI_PACKAGE_ID`
- `SUI_SPONSOR_PRIVATE_KEY` (서버 전용, 노출 금지)
- 관리자 객체가 필요하면: `SUI_ADMINCAP_ID`, `SUI_TREASURY_CAP_ID`

## 실패/예외 처리 가이드

- 가스 부족: 스폰서 잔액 부족 시 즉시 알람/리트라이 중단.
- 유효 시간 초과: lock_time 이후 베팅, end_time 이전 정산 등은 서버에서 사전 차단.
- 서명 불일치: `txBytes`가 서버 빌드본과 다른 경우 거절, 새로 빌드/전달.
- 체인 오류: `assert` 실패, shared object 버전 충돌 시 재시도 전략(재빌드+재서명) 필요.

## 컨트랙트 매핑(베팅/정산/민트)

- 베팅(`place_bet`): 유저 소유 `Coin<DEL>` 입력 필요 → 유저 서명 필수. 생성된 `Bet` 객체는 유저 소유(지갑 히스토리는 커스텀 객체라 기본 UI엔 안 뜰 수 있음).
- 정산(`finalize_round`): AdminCap 요구, 가스/서명 모두 스폰서 계정이면 충분.
- 배당(`distribute_payout`): 반환된 `Coin<DEL>`을 유저에게 transfer해야 지갑에 DEL이 표시됨.
- 발행(`del::mint`): TreasuryCap 보유 계정(관리자)이 발행 → 수신자가 유저이면 지갑에 DEL 자산/트랜잭션 표시.

## TODO/오픈 이슈

- 프런트: Wallet Kit 연동, 서명/네트워크 오류 UX 설계.
- 백엔드: PTB 빌더/서명/실행 유틸 추가, nonce/리플레이 방지, 스폰서 잔액 모니터링.
- 보안: 스폰서 키 보호(키 로테이션 절차, 권한 분리), API 인증(로그인 토큰)과 서명 데이터 매핑.
- 인덱싱/조회: 온체인 이벤트 ↔ D1 매핑으로 “내 베팅/정산 기록” UI 구현.
