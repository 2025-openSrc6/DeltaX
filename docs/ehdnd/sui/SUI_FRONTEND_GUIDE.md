# SUI Frontend Guide: "베팅 버튼" 구현하기

이 문서는 프론트엔드 개발자가 **"베팅 버튼"**을 만들 때 알아야 할 **최소한의 지식**과 **구현 순서**를 담고 있습니다. 백엔드(`gemm.md`)보다 훨씬 단순합니다.

---

## 1. 🐣 프론트엔드의 역할: "읽고, 서명하고, 전달한다"

블록체인 로직(PTB 빌드, 가스비 계산 등)은 모두 **백엔드**가 합니다.
프론트엔드는 딱 하나만 기억하면 됩니다:

> **"서버가 준 종이(`txBytes`)를 받아서, 유저 도장(`Signature`)을 받아 다시 서버에 준다."**

---

## 2. 🚦 핵심 플로우 (3-Step)

사용자가 "베팅하기" 버튼을 눌렀을 때의 동작입니다.

### Step 1. 준비 요청 (Call API)

- 서버에게 "이 유저가 베팅하려고 해, 주문서 만들어줘"라고 요청합니다.
- **Request**: `POST /api/sui/bet/tx`
  - body: `{ amount: 100, prediction: 'GOLD' }` (유저가 입력한 값)
- **Response**: `{ txBytes: "base64...", nonce: "..." }`
  - 여기서 `txBytes`는 "암호화된 주문서"입니다. 내용을 해석하려 하지 말고 그냥 받으세요.

### Step 2. 서명 하기 (Wallet Sign)

- 지갑(SuiET, Mnemonic 등)을 깨워서 서명 창을 띄웁니다.
- **중요**: `executeTransactionBlock`이 아니라 **`signTransactionBlock`** 함수를 써야 합니다.
  - 우리는 가스비 대납을 위해 "서명만" 필요하지, 지갑이 직접 "실행"하면 안 되기 때문입니다.
- **Code**:
  ```typescript
  // dApp Kit 예시
  const { signature } = await signTransactionBlock({
    transactionBlock: fromBase64(serverRes.txBytes),
  });
  ```
- **결과**: `userSignature` (유저 도장)

### Step 3. 실행 요청 (Call API)

- 서버에게 "자, 유저 도장 여기 있어. 이제 실행해!"라고 전달합니다.
- **Request**: `POST /api/sui/bet/execute`
  - body: `{ txBytes: "...", userSignature: "...", nonce: "..." }`
- **Response**: `{ txDigest: "...", status: "SUCCESS" }`
  - 성공하면 UI에서 "베팅 완료!"를 띄우면 끝입니다.

---

## 3. ⚠️ 프론트엔드가 고려해야 할 사항들 (Checklist)

### 3.1 네트워크 체크 (Network Check)

- 우리 서비스는 `Testnet`을 씁니다.
- 유저 지갑이 실수로 `Mainnet`에 연결되어 있으면? -> **서명 실패**하거나, 서버에서 거절당합니다.
- **UI**: 버튼 누르기 전에 `wallet.chain === 'sui:testnet'`인지 확인하고, 아니면 "테스트넷으로 변경해주세요" 팝업 띄우기.

### 3.2 에러 핸들링 (Error Handling)

1.  **유저가 취소함**: 서명 창 떴는데 "거절" 누름. -> 조용히 모달 닫기.
2.  **타임아웃**: 서버 `prepare`가 너무 늦거나, 유저가 서명을 늦게 해서 세션 만료. -> "시간이 초과되었습니다. 다시 시도해주세요."
3.  **실행 실패**: Step 3에서 서버가 400/500 에러를 줌. -> 서버 메시지(예: "잔액 부족", "이미 마감됨")를 유저에게 토스트 메시지로 보여주기.

### 3.3 로딩 상태 (Loading State)

- 이 과정은 은근히 깁니다. (API 호출 2번 + 지갑 팝업).
- Step 1부터 Step 3 끝날 때까지 **버튼을 비활성화(Loading Spinner)** 해야 합니다.
- 안 그러면 유저가 답답해서 5번 눌러버립니다. (물론 서버가 막겠지만 UX상 안 좋음)

---

## 4. 📝 최종 정리

1.  **복잡한 건 서버가 다 했다.** (`gemm.md`의 고통은 잊으세요.)
2.  **당신은 전달자다.** (Server -> Wallet -> Server)
3.  **`signTransactionBlock`만 쓴다.** (`execute` X)

이것만 알면 당신도 훌륭한 Web3 프론트엔드 개발자입니다! 👍
