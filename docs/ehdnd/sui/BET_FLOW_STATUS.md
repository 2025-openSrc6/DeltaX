# Bet 온체인 통합 현재 상태 & 다음 단계 (2025-12)

## 현재 구현 흐름

- 준비(`/api/bets`):
  - 라운드 상태/시간 검증 → bet row `PENDING` 생성(풀/잔액 **미차감**) → Sui PTB 준비(`txBytes/nonce/expiresAt`, betId 반환).
- 실행(`/api/bets/execute`):
  - nonce/txBytes 검증 후 Sui 실행.
  - 성공 시 `finalizeExecution`에서 한 트랜잭션으로 **풀/잔액 확정 차감 + bet `chainStatus=EXECUTED`, `suiTxHash` 기록**.
  - 실패 시 예외 반환, bet는 `PENDING` 유지(재준비/재실행 가능).
- SuiService는 체인 호출 전용, BetService가 오케스트레이션 및 D1 업데이트 담당.

## 의사결정 요약

- DB 선차감 → 체인 실패 불일치 위험을 피하기 위해 **체인 성공 후 D1 확정**으로 전환.
- 준비 단계에서는 bet 의도만 기록하고, 실행 성공 시에만 풀/잔액을 조정.
- 실패/재시도 정책은 최소화된 상태(예외 반환만)로 두고, 추후 보강 예정.

## 남은 과제 / 다음 단계 제안

- 실패 상태 관리: Sui 실행 실패 시 `chainStatus=FAILED` 마킹 또는 리커버리 큐 적재.
- 재준비 정책: nonce 만료/실패 시 동일 betId로 재준비 허용 여부와 제한 횟수 결정.
- 리커버리/재처리:
  - finalize 단계에서 DB 실패 시 재시도 큐 처리.
  - 이미 EXECUTED인 bet의 멱등 처리 규칙 명시(현재는 기존 `suiTxHash` 있으면 반환).
- 잔액 사전 검증: 준비 단계에서 사용자 잔액을 조회/예약할지 여부 결정.
- 모니터링: 실행 실패/DB 실패 로깅 및 대시보드, 알림 연동.

## 참고 경로

- 준비: `app/api/bets/route.ts` → `betService.createBetWithSuiPrepare`
- 실행: `app/api/bets/execute/route.ts` → `betService.executeBetWithUpdate`
- 오케스트레이션/확정: `lib/bets/service.ts`, `lib/bets/repository.ts`
