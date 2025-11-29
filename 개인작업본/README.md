# 차트 모듈 개발 문서 (김현준)

> DeltaX 프로젝트 - 차트 시각화 및 가격 데이터 모듈

**담당자**: 김현준
**역할**: 차트 시각화 및 실시간 가격 데이터 수집
**개발 기간**: 2025.11.5 ~ 2025.12.17

---

## 📂 문서 구조

> 📌 **빠른 네비게이션**: [00-INDEX.md](./00-INDEX.md) 참고

```
개인작업본/
├── 00-INDEX.md                  # 📌 문서 네비게이션 (여기서 시작!)
├── README.md                    # 이 파일 - 프로젝트 전체 개요
│
├── 01-DESIGN/                   # 설계 문서
│   ├── chart-erd.md            # 데이터베이스 ERD 설계
│   ├── ui-mockup-design.md     # UI 목업 및 컴포넌트 설계
│   └── tech-stack-decision.md  # 기술 스택 선정 문서
│
├── 02-REQUIREMENTS/             # 요구사항
│   └── taskPRD.md              # 상세 요구사항 명세 (참고용)
│
├── 03-PROGRESS/                 # 진행 상황 보고
│   ├── week-1-complete.md      # Week 1 완료 보고 (설계)
│   └── week-2-complete.md      # Week 2 완료 보고 (UI 구현)
│
└── 04-SETUP/                    # 환경 구축
    └── SETUP-GUIDE.md          # 개발 환경 설치 가이드
```

---

## 🎯 모듈 개요

### 책임 범위

1. **실시간 가격 데이터 수집**
   - PAXG, BTC 등 자산의 실시간 가격 추적
   - WebSocket을 통한 데이터 스트리밍
   - 외부 API (CoinGecko, Binance) 연동

2. **차트 시각화**
   - 가격 차트 (캔들스틱, 라인, 영역)
   - 변동성 지표 (RSI, 볼린저 밴드, MACD 등)
   - 듀얼/오버레이/싱글 뷰 모드

3. **베팅 시스템 연동**
   - 차트 위 베팅 마커 표시
   - 베팅 결과 시각화
   - AI 기반 추천 표시

### 다른 모듈과의 인터페이스

#### 제공하는 API

```
GET  /api/chart/price/{asset}      # 최신 가격
GET  /api/chart/historical          # 과거 데이터
GET  /api/chart/volatility          # 변동성 지표
GET  /api/chart/compare             # 자산 비교
WS   /api/chart/realtime            # 실시간 스트림
```

#### 의존하는 모듈

- **김도영 (유저/지갑)**: User.id (베팅 마커 식별)
- **장태웅 (베팅)**: BettingRound, Bet (마커 데이터)

---

## 📅 개발 일정

### Week 1 (11/5 - 11/11): 설계 및 환경 구축 ✅

- [x] ERD 설계
- [x] UI 목업 제작
- [x] 기술 스택 선정
- [x] 문서 정리 및 통합
  > 📄 [week-1-complete.md](./03-PROGRESS/week-1-complete.md)

### Week 2 (11/12 - 11/18): 기본 UI 구현 ✅

- [x] 타입 시스템 구축 (145 lines)
- [x] Zustand 상태 관리 (261 lines)
- [x] 유틸리티 함수 (178 lines)
- [x] React 컴포넌트 (PriceChart, ChartHeader, ChartContainer)
- [x] Mock 데이터 생성
  > 📄 [week-2-complete.md](./03-PROGRESS/week-2-complete.md)

### Week 3 (11/19 - 11/25): 핵심 기능 개발

- [ ] WebSocket 실시간 스트리밍
- [ ] 변동성 지표 계산
- [ ] 베팅 마커 연동
- [ ] 상태 관리 (Zustand) 구현

### Week 4 (11/26 - 12/2): 통합 및 테스트

- [ ] 다른 모듈과 API 연동
- [ ] 성능 최적화
- [ ] 단위 테스트 작성
- [ ] 버그 수정

### Week 5-6 (12/3 - 12/13): 시험기간 (개발 중단)

### Final Week (12/14 - 12/16): 최종 마무리

- [ ] 코드 리팩토링
- [ ] 문서화 완료
- [ ] 배포 준비

---

## 🛠️ 기술 스택

### Frontend

- **프레임워크**: Next.js 14 (App Router)
- **차트 라이브러리**: Recharts → TradingView Lightweight Charts (마이그레이션 예정)
- **상태 관리**: Zustand
- **스타일링**: Tailwind CSS + shadcn/ui
- **WebSocket**: Socket.io Client

### Backend

- **API**: Next.js API Routes
- **WebSocket**: Socket.io Server
- **데이터베이스**: PostgreSQL + Prisma ORM
- **캐싱**: Redis (프로덕션) / LRU Cache (개발)

### 외부 API

- **1차**: CoinGecko API (50 calls/min)
- **2차**: Binance API (1200 calls/min, fallback)

---

## 📊 데이터 모델

### 주요 테이블

#### 1. ChartData

```prisma
model ChartData {
  id        String   @id @default(cuid())
  asset     String   // 'PAXG', 'BTC', 'ETH', ...
  timestamp DateTime
  open      Float
  high      Float
  low       Float
  close     Float
  volume    Float
  volatility Float?
  rsi        Float?

  @@index([asset, timestamp])
  @@unique([asset, timestamp])
}
```

#### 2. VolatilitySnapshot

```prisma
model VolatilitySnapshot {
  id              String   @id @default(cuid())
  asset           String
  timestamp       DateTime
  stdDev          Float
  percentChange   Float
  atr             Float?
  bollingerUpper  Float?
  bollingerMiddle Float?
  bollingerLower  Float?

  @@index([asset, timestamp])
}
```

#### 3. BettingMarker (연동용)

```prisma
model BettingMarker {
  id         String   @id @default(cuid())
  userId     String
  asset      String
  timestamp  DateTime
  betAmount  Float
  entryPrice Float
  exitPrice  Float?
  result     String?
  profit     Float?

  @@index([userId, asset])
}
```

---

## 🎨 UI 컴포넌트 구조

```
<ChartContainer>
  ├── <ChartHeader>
  │   ├── <AssetSelector>        # [PAXG] [BTC] [ETH] [SOL]
  │   ├── <TimeRangeSelector>    # [1h] [24h] [7d] [30d]
  │   ├── <ViewModeToggle>       # Dual / Overlay / Single
  │   └── <ChartTypeSelector>    # Candlestick / Line / Area
  │
  ├── <ChartGrid>
  │   └── <PriceChart>           # 가격 차트 (Recharts)
  │       ├── Candlesticks
  │       ├── Volume Bars
  │       └── Betting Markers
  │
  ├── <VolatilityPanel>
  │   ├── <VolatilityCard asset="PAXG">
  │   ├── <VolatilityCard asset="BTC">
  │   └── <ComparisonCard>       # PAXG vs BTC 비교
  │
  └── <BettingWidget>
      ├── <AssetSelect>
      ├── <BetAmountInput>
      ├── <CurrentPriceDisplay>
      ├── <AIRecommendation>
      └── <BetButtons>
```

---

## 🔗 협업 가이드

### Commit Convention

```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 작성/수정
design: ERD, UI 설계
style: 코드 포맷팅
refactor: 코드 리팩토링
test: 테스트 코드
chore: 기타 작업
```

**예시**:

```bash
git commit -m "feat: Add real-time price chart component"
git commit -m "docs: Update ERD with VolatilitySnapshot table"
git commit -m "fix: Resolve WebSocket reconnection issue"
```

### Branch Strategy

```
main
  └── dev
      └── feature/chart-{feature-name}
```

**예시**:

```bash
git checkout -b feature/chart-price-component
git checkout -b feature/chart-websocket
```

### Issue & PR 템플릿

#### Issue 생성 시

```markdown
## Description

간단한 설명

## Tasks

- [ ] Task 1
- [ ] Task 2

## Related

- 연관 Issue: #123
- 의존 모듈: 베팅 시스템 (장태웅)
```

#### PR 생성 시

```markdown
## Changes

변경사항 요약

## Screenshots

스크린샷 (UI 변경 시)

## Checklist

- [ ] 테스트 완료
- [ ] 문서 업데이트
- [ ] 코드 리뷰 요청
```

---

## 📝 주요 문서 링크

> 📌 전체 문서 목록은 [00-INDEX.md](./00-INDEX.md)에서 확인

### 설계 문서

- [ERD 설계](./01-DESIGN/chart-erd.md) - 데이터베이스 스키마
- [UI 목업](./01-DESIGN/ui-mockup-design.md) - 화면 설계 및 컴포넌트 구조
- [기술 스택 결정](./01-DESIGN/tech-stack-decision.md) - 라이브러리 선정 근거

### 진행 상황

- [Week 1 완료](./03-PROGRESS/week-1-complete.md) - 설계 작업 완료
- [Week 2 완료](./03-PROGRESS/week-2-complete.md) - UI 구현 완료

### 요구사항 (참고용)

- [상세 PRD](./02-REQUIREMENTS/taskPRD.md) - 전체 요구사항 명세

### 환경 구축

- [설치 가이드](./04-SETUP/SETUP-GUIDE.md) - 개발 환경 셋업

---

## 🚀 Quick Start (개발 환경 구축)

### 1. 의존성 설치

```bash
# 루트 디렉토리에서
npm install

# 주요 패키지
npm install recharts zustand socket.io socket.io-client
npm install @radix-ui/react-select @radix-ui/react-progress
npm install @prisma/client
npm install -D prisma
```

### 2. 환경 변수 설정

```bash
cp .env.example .env.local
```

```.env.local
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/deltax"

# External APIs
COINGECKO_API_KEY="your_key"
BINANCE_API_KEY="your_key"

# WebSocket
WS_PORT=3001

# Next.js
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

### 3. 데이터베이스 마이그레이션

```bash
npx prisma migrate dev --name init-chart-schema
npx prisma generate
```

### 4. 개발 서버 실행

```bash
npm run dev
```

---

## 📊 성능 목표

### 응답 시간

- API 응답: < 100ms
- 차트 렌더링: < 1초
- WebSocket 레이턴시: < 500ms

### 처리량

- 동시 WebSocket 연결: 1,000개
- API 처리량: 100 req/s

### 데이터

- 캔들 데이터: 90일 보관
- 변동성 스냅샷: 30일 보관

---

## 🐛 알려진 이슈

_현재 없음 (개발 진행 중)_

---

## 📞 연락처

**담당자**: 김현준
**역할**: 차트 시각화
**GitHub**: @hyeonjun (예시)
**Email**: example@email.com (예시)

---

## 📜 라이선스

MIT License - DeltaX Team 6, 숭실대학교 오픈소스기반기초설계

---

**Last Updated**: 2025-11-12
**Document Version**: 2.0 (문서 구조 개편)
