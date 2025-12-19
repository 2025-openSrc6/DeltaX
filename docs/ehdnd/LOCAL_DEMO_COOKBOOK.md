# Local Demo Cookbook (DEMO_3MIN + 3 wallets) — 2025-12-15

목표: **로컬에서 “라운드 생성 → 오픈 → 3지갑 베팅 → 락 → 파이널 → 승자 클레임”**을 3~5분 안에 라이브로 재현한다.

- 데모 환경: **로컬(next dev) + 로컬 D1** (운영 6HOUR 라운드와 섞이지 않음)
- 라운드 타입: `DEMO_3MIN`
  - 라운드 길이: 3분
  - 베팅 가능 시간: 1분 (`lockTime`)

---

## 0) 사전 준비 체크리스트

- **3개 지갑 주소** 준비 (A/B/C)
  - 발표자가 브라우저 프로필 3개(또는 2개+시크릿)로 각각 지갑을 연결해둔다.
- **SUI(testnet)**: 3개 지갑 모두 faucet으로 최소 0.1~0.5 SUI (서명/전송/조회 안정성)
- **DEL**: 3개 지갑 모두 베팅할 만큼의 DEL Coin object가 있어야 한다.
- **Upstash Redis**: Sponsored Tx prepare/execute nonce 저장에 필요
- **Cron secret**: 로컬에서 cron route 수동 호출에 필요

---

## 1) 로컬 환경 변수(.env.local)

최소 필요:

- **cron**
  - `CRON_SECRET`: cron route 인증용
- **sui**
  - `SUI_RPC_URL` (기본: testnet fullnode)
  - `SUI_PACKAGE_ID`
  - `SUI_ADMIN_CAP_ID` (or `SUI_CAP_OBJECT_ID`)
  - `SUI_TREASURY_CAP_ID` (DEL mint용)
  - `SUI_SPONSOR_PRIVATE_KEY` (base64 권장)
- **upstash**
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

cron route는 아래 헤더로 호출된다:

```text
X-Cron-Secret: <CRON_SECRET>
```

구현: `lib/cron/auth.ts`

---

## 2) 로컬 실행

```bash
# 1) 의존성
npm install

# 2) 로컬 D1 마이그레이션
npm run db:dev:prepare

# 3) dev server
npm run dev
```

기본 베이스 URL:

```text
http://localhost:3000
```

---

## 3) (중요) 3개 지갑에 DEL 준비

### 3.1 DEL 민팅 (지갑 A/B/C 각각)

아래 스크립트는 `deltax::del::mint`를 sponsor로 실행해서 대상 주소에 DEL을 전송하고, 잔액을 확인한다.

```bash
# 예시: 지갑 A에 500 DEL 민팅
TARGET=0xAAAA... AMOUNT_DEL=500 npm exec tsx scripts/sui-mint-check.ts

# 지갑 B
TARGET=0xBBBB... AMOUNT_DEL=500 npm exec tsx scripts/sui-mint-check.ts

# 지갑 C
TARGET=0xCCCC... AMOUNT_DEL=500 npm exec tsx scripts/sui-mint-check.ts
```

> 참고: sponsor 키를 `suiprivkey...` 포맷으로 넣었다면, 스크립트가 base64로 자동 정규화한다.

### 3.2 각 지갑의 `userDelCoinId` 찾기

`POST /api/bets`(prepare)는 `userDelCoinId`가 필요하다. 아래 스크립트로 지갑 주소가 가진 DEL coin object id를 뽑는다.

```bash
OWNER=0xAAAA... npm exec tsx scripts/sui-list-del-coins.ts
OWNER=0xBBBB... npm exec tsx scripts/sui-list-del-coins.ts
OWNER=0xCCCC... npm exec tsx scripts/sui-list-del-coins.ts
```

출력된 `coinObjectId` 중 1개를 해당 지갑의 `userDelCoinId`로 사용한다.

---

## 4) 데모 라운드 생성 → 오픈 → 락 → 파이널 (수동 cron)

### 4.1 라운드 생성 (DEMO_3MIN)

데모가 꼬이지 않도록 startTime을 “지금+20초” 정도로 둔다.

```bash
START_TIME_MS=$(( $(date +%s000) + 20000 ))

curl -sS -X POST 'http://localhost:3000/api/rounds' \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"DEMO_3MIN\",\"startTime\":${START_TIME_MS}}" | jq
```

응답의 `round.id`를 기록해둔다(선택).

### 4.2 오픈 (Job 2 수동 호출)

startTime이 지난 뒤 호출해야 한다.

```bash
curl -sS -X POST 'http://localhost:3000/api/cron/rounds/open' \
  -H "X-Cron-Secret: ${CRON_SECRET}" | jq
```

성공하면 라운드가 `BETTING_OPEN`이 되고, Sui에 `create_pool(lockTime,endTime)`가 실행되어 `suiPoolAddress`가 채워진다.

### 4.3 락 (Job 3 수동 호출)

베팅 윈도우(1분)가 지난 뒤 호출한다.

```bash
curl -sS -X POST 'http://localhost:3000/api/cron/rounds/lock' \
  -H "X-Cron-Secret: ${CRON_SECRET}" | jq
```

### 4.4 파이널 (Job 4 수동 호출)

라운드 종료(3분)가 지난 뒤 호출한다.

```bash
curl -sS -X POST 'http://localhost:3000/api/cron/rounds/finalize' \
  -H "X-Cron-Secret: ${CRON_SECRET}" | jq
```

> Job 5(서버 배당)는 폐기되었고, 데모의 엔딩은 “승자 클레임”이다.

---

## 5) 베팅 + 클레임 (3 wallets)

이 파트는 **브라우저(UI)**에서 진행하는 것을 권장한다.

왜냐하면 API는 `httpOnly` 쿠키 `suiAddress` 기반 세션을 요구하고(`requireAuth`),
`POST /api/auth/session`은 실제 지갑 서명 검증을 수행하기 때문이다.

구현 개요는 `docs/ehdnd/BET_AND_CLAIM_API_GUIDE.md` 참고.

### 5.1 (각 지갑 A/B/C) 로그인/세션 생성

- 프론트에서 지갑 연결 버튼 → 로그인 메시지 서명
- 성공 시 서버가 쿠키 `suiAddress`를 설정함

### 5.2 (각 지갑) 베팅

1. **Bet Prepare**: `POST /api/bets`
   - 입력에 `roundId`, `prediction`, `amount`, `userDelCoinId`
2. 지갑에서 txBytes 서명
3. **Bet Execute**: `POST /api/bets/execute`

### 5.3 승자(또는 임의 지갑) 클레임

1. **Claim Prepare**: `POST /api/bets/claim/prepare` (body: `{ betId }`)
2. 지갑에서 txBytes 서명
3. **Claim Execute**: `POST /api/bets/claim/execute`

---

## 6) 흔한 실패/대응

- **open이 cancelled**: startTime/lockTime 타이밍을 놓친 것.
  - 해결: `POST /api/rounds`로 새 `DEMO_3MIN` 라운드 생성 후 다시 진행.
- **prepare/execute가 INVALID_NONCE**: Upstash 설정 누락, 만료(5분), 또는 중복 실행.
  - 해결: Upstash env 확인 후 prepare부터 재시도.
- **Sui sponsor gas 부족**: `SUI_SPONSOR_PRIVATE_KEY` 주소에 SUI가 부족.
  - 해결: sponsor 지갑에 SUI 충전.
- **userDelCoinId 오류**: 지갑에 DEL coin object가 없거나, 다른 타입 coin id를 넣음.
  - 해결: `scripts/sui-mint-check.ts`로 민팅 후 `scripts/sui-list-del-coins.ts`로 coinObjectId 재확인.
