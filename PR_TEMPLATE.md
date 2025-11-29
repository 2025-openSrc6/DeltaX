# feat: 차트 모듈 스키마 추가 (WIP - 팀 상담 필요)

## 📋 작업 내용

차트 모듈의 데이터베이스 스키마를 추가했습니다. 게임성 강화를 위한 변동성 지표 및 비교 분석을 위한 테이블 구조를 설계했습니다.

### 추가된 테이블

1. **`chart_data`** - 캔들스틱 데이터 및 게임성 지표
   - OHLCV 데이터 저장
   - 변동성의 변동성 비교를 위한 지표 필드 추가
   - 게임성 강화 지표 (movementIntensity, trendStrength, relativePosition)

2. **`volatility_snapshots`** - 변동성 지표 스냅샷
   - 복잡한 계산 결과 캐싱
   - 표준편차, 변동률, ATR, 볼린저 밴드, MACD 등

## 🎯 주요 기능

### 변동성의 변동성 비교

- `volatilityChangeRate`: 평균 변동성 대비 현재 변동성 비율
- `volatilityScore`: 0-100 정규화된 점수 (게임 UI 표시용)
- BTC와 PAXG를 공정하게 비교 가능

### 게임성 지표

- `movementIntensity`: 움직임 강도
- `trendStrength`: 트렌드 강도
- `relativePosition`: 상대적 위치

## 📝 변경 사항

### 새로 생성된 파일

- `db/schema/chartData.ts`
- `db/schema/volatilitySnapshots.ts`

### 수정된 파일

- `db/schema/index.ts` - export 추가

## ⚠️ 주의사항

- **아직 마이그레이션은 생성하지 않았습니다**
- 팀원들과 스키마 검토 후 마이그레이션 진행 예정
- 변동성 계산 방식 (표준편차 vs 변동률 vs ATR vs 단순 범위 비율) 결정 필요

## 🔍 검토 필요 사항

- [ ] 테이블명 충돌 확인 (`chart_data`, `volatility_snapshots`)
- [ ] 기존 테이블과의 관계 확인
- [ ] 인덱스/제약조건 충돌 확인
- [ ] 변동성 계산 방식 결정
- [ ] 각 필드 계산 로직 확정

## 📅 다음 단계

1. 팀원들과 스키마 검토 및 피드백 수집
2. 변동성 계산 방식 최종 결정
3. 마이그레이션 생성 (`npm run db:generate`)
4. 로컬 DB 테스트 (`npm run db:migrate:local`)
5. 원격 DB 적용 (`npm run db:migrate`)

## 🔗 관련 문서

- [차트 개발 계획서](./개인작업본/01-DESIGN/chart-development-plan.md)
- [ERD 설계](./개인작업본/01-DESIGN/chart-erd.md)

---

**상태**: 🟡 Draft (팀 상담 필요)  
**리뷰어**: @팀원들  
**라벨**: `enhancement`, `database`, `chart`, `wip`
