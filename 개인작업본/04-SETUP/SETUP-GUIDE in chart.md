# 차트 모듈 설치 가이드

**작성일**: 2025-11-11
**담당자**: 김현준
**Phase**: Week 2 - UI 구현

---

## 📦 필수 패키지 설치

### 1. NPM 권한 문제 해결 (필요 시)

```bash
sudo chown -R $(whoami) "/Users/hyeonjun/.npm"
```

### 2. 차트 라이브러리 설치

```bash
cd /Users/hyeonjun/Desktop/오소기/DeltaX

# Recharts (차트 라이브러리)
npm install recharts

# Socket.IO Client (실시간 WebSocket)
npm install socket.io-client

# 타입 정의 (선택)
npm install -D @types/recharts
```

---

## 📂 생성된 파일 목록

### 타입 정의

- ✅ `types/chart.ts` - 차트 모듈 타입 정의

### 상태 관리

- ✅ `store/useChartStore.ts` - Zustand 스토어

### 유틸리티

- ✅ `lib/utils/chart.ts` - 차트 유틸리티 함수

### 컴포넌트

- ✅ `app/components/chart/PriceChart.tsx` - 가격 차트 컴포넌트
- ✅ `app/components/chart/ChartHeader.tsx` - 필터/설정 헤더
- ✅ `app/components/chart/ChartContainer.tsx` - 메인 컨테이너

### 페이지

- ✅ `app/chart/page.tsx` - 차트 페이지

---

## 🚀 개발 서버 실행

```bash
npm run dev
```

브라우저에서 확인:

```
http://localhost:3000/chart
```

---

## ⚠️ 현재 상태

### 완료된 작업

- ✅ 타입 정의 및 상태 관리 구현
- ✅ 기본 차트 컴포넌트 생성
- ✅ 차트 페이지 생성

### 미완성 기능 (Week 3)

- ❌ API 엔드포인트 구현
  - `/api/chart/price/:asset`
  - `/api/chart/historical`
  - `/api/chart/volatility`
- ❌ WebSocket 실시간 데이터
- ❌ 변동성 지표 패널
- ❌ 베팅 위젯

### 현재 데이터 상태

- 📌 실제 API 없이 Mock 데이터로 테스트 필요
- 📌 Recharts 차트는 렌더링되지만 데이터가 없음

---

## 🔧 다음 단계

### 1. 패키지 설치

```bash
npm install recharts socket.io-client
```

### 2. Mock API 생성 (테스트용)

`app/api/chart/historical/route.ts` 파일에 임시 Mock 데이터 생성

### 3. 개발 서버에서 확인

```bash
npm run dev
# http://localhost:3000/chart 접속
```

### 4. API 엔드포인트 구현 (Week 3)

- CoinGecko API 연동
- 데이터베이스 연결
- WebSocket 서버 구축

---

## 📝 파일 구조

```
DeltaX/
├── types/
│   └── chart.ts              # 타입 정의
├── store/
│   └── useChartStore.ts      # Zustand 스토어
├── lib/
│   └── utils/
│       └── chart.ts          # 유틸리티 함수
├── app/
│   ├── components/
│   │   └── chart/
│   │       ├── ChartContainer.tsx
│   │       ├── ChartHeader.tsx
│   │       └── PriceChart.tsx
│   ├── chart/
│   │   └── page.tsx          # 차트 페이지
│   └── api/
│       └── chart/            # (Week 3에 생성)
│           ├── historical/
│           ├── volatility/
│           └── compare/
└── 개인작업본/
    ├── SETUP-GUIDE.md        # 이 파일
    └── week-1-complete.md    # Week 1 완료 보고서
```

---

## 🐛 트러블슈팅

### 1. "Cannot find module '@/types/chart'" 에러

**해결**: tsconfig.json의 paths 설정 확인 (이미 설정됨)

### 2. Recharts 차트가 안 보임

**원인**: 패키지 미설치 또는 데이터 없음
**해결**:

```bash
npm install recharts
```

### 3. Zustand persist 에러

**원인**: 서버/클라이언트 hydration 불일치
**해결**: 'use client' 지시어 확인

---

## 📞 문의

**담당자**: 김현준
**Slack**: @hyeonjun

**버그 리포트**: GitHub Issues
**설계 문서**: [docs/README-CHART.md](../docs/README-CHART.md)

---

**마지막 업데이트**: 2025-11-11
**다음 업데이트**: Week 3 API 구현 시작 시
