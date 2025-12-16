# DeltaX 베팅 시스템 PPT 요약

> 키워드 위주 정리 (슬라이드용)

---

## 1. 라운드 Cron Job 시스템

### 라운드 상태 (FSM - 7개)

```
SCHEDULED → BETTING_OPEN → BETTING_LOCKED → CALCULATING → SETTLED
                ↓                ↓               ↓
            CANCELLED        CANCELLED        VOIDED
```

### Cron Job 흐름 (5개 Job)

| Job                 | 역할                      | 트리거          |
| ------------------- | ------------------------- | --------------- |
| **Job 1: Create**   | 다음 라운드 생성          | 정기 스케줄     |
| **Job 2: Open**     | 베팅 시작 + 시작가격 기록 | startTime 도달  |
| **Job 3: Lock**     | 베팅 마감                 | lockTime 도달   |
| **Job 4: Finalize** | 종료가격 기록 + 승자 판정 | endTime 도달    |
| **Job 5: Settle**   | 정산 + 환금               | CALCULATING 후  |
| **Job 6: Recovery** | stuck 라운드 복구/알림    | 10분+ 지연 감지 |

### FSM 핵심 함수

- `canTransition(from, to)` - 전이 가능 여부
- `transitionRoundStatus()` - 상태 전이 + 멱등성 보장 + 메타데이터 검증

---

## 2. 배당 계산 로직 (Calculator)

### 승자 판정

```
변동률 = (종료가 - 시작가) / 시작가
승자 = 변동률 높은 자산 (동률 시 GOLD 승)
```

### 정산 공식

```
플랫폼 수수료 = 총 풀 × 5%
배당 풀 = 총 풀 - 플랫폼 수수료
배당 비율 = 배당 풀 / 승자 풀
개인 배당 = 베팅액 × 배당 비율
```

### 예시

- 총 풀: 1,000,000 DEL
- GOLD: 600,000 / BTC: 400,000
- 승자: GOLD
- 수수료: 50,000 (5%)
- 배당 풀: 950,000
- 배당 비율: 1.583x
- 100,000 베팅 → 158,333 수령

---

## 3. Next.js 보안 패치

- 최신 Next.js 16.0.7 적용
- HTTP-only 쿠키 기반 세션
- API Route 보호 (requireAuth, optionalAuth)
- Cron Secret 인증 (`X-Cron-Secret`)

---

## 4. Sui Move 컨트랙트 (Web3)

### DEL 코인

- Sui 네트워크 발행
- testnet 배포 완료

### 베팅 시스템 온체인

- Pool 생성 (라운드당 1개)
- 베팅 기록 on-chain
- 정산 결과 on-chain 저장

### 정산 로직

- 승자 Pool에서 배당 분배
- 플랫폼 수수료 수취

---

## 5. BET 온/오프체인 통합 (SuiService)

### 2단계 트랜잭션 (prepare + execute)

```
1. prepareBetTransaction()
   - 스폰서 가스비 설정
   - PTB 빌드 + Dry Run
   - nonce 발급 (Upstash Redis 저장)

2. executeBetTransaction()
   - nonce 검증 + 소비
   - 스폰서 서명 + 체인 실행
   - ensureOnChain() 확인
```

### 스폰서 가스비 대납

- 사용자 가스비 부담 없음
- 백엔드에서 스폰서 키로 서명
- 사용자 + 스폰서 다중 서명

### Nonce 관리

- Upstash Redis 저장
- TTL 기반 만료 (5분)
- 1회성 소비

---

## 6. 주요 기술 스택

| 영역           | 기술                       |
| -------------- | -------------------------- |
| **Backend**    | Next.js 16, TypeScript     |
| **Database**   | Cloudflare D1, Drizzle ORM |
| **Blockchain** | Sui Move, @mysten/sui      |
| **Cache**      | Upstash Redis              |
| **Scheduler**  | Cron API Routes            |

---

## 7. 핵심 키워드 요약

```
라운드 생명주기    FSM 상태 머신
Cron Job 6개      자동화된 라운드 관리
변동률 기반 승자   공정한 배당 계산
플랫폼 수수료 5%   지속가능한 수익 모델
스폰서 가스비      사용자 친화적 UX
2단계 트랜잭션    보안 + 신뢰성
온체인 정산        투명한 결과 검증
testnet 배포      실제 동작 검증
```
