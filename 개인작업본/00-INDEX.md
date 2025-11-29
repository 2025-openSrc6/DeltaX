# 📚 차트 모듈 문서 인덱스

**담당자**: 김현준 (차트 시각화)
**마지막 업데이트**: 2025-11-12

---

## 🗂️ 문서 구조

```
개인작업본/
├── 00-INDEX.md                      # 📌 이 파일 (문서 네비게이션)
│
├── README.md                        # 프로젝트 전체 개요
│
├── 01-DESIGN/                       # 설계 문서
│   ├── chart-erd.md                # 데이터베이스 ERD
│   ├── ui-mockup-design.md         # UI 목업 및 컴포넌트 구조
│   └── tech-stack-decision.md      # 기술 스택 선정
│
├── 02-REQUIREMENTS/                 # 요구사항
│   └── taskPRD.md                  # 상세 요구사항 명세 (참고용)
│
├── 03-PROGRESS/                     # 진행 상황
│   ├── week-1-complete.md          # Week 1 완료 보고
│   └── week-2-complete.md          # Week 2 완료 보고 (신규)
│
└── 04-SETUP/                        # 설치 및 실행
    └── SETUP-GUIDE.md              # 개발 환경 구축
```

---

## 🚀 빠른 시작

### 처음 오는 사람

1. [README.md](./README.md) - 프로젝트 개요
2. [01-DESIGN/](./01-DESIGN/) - 설계 문서 모음
3. [SETUP-GUIDE.md](./SETUP-GUIDE.md) - 환경 구축

### 백엔드 개발자

- [chart-erd.md](./01-DESIGN/chart-erd.md) - DB 스키마
- [tech-stack-decision.md](./01-DESIGN/tech-stack-decision.md) - API 설계

### 프론트엔드 개발자

- [ui-mockup-design.md](./01-DESIGN/ui-mockup-design.md) - UI 설계
- [week-2-complete.md](./03-PROGRESS/week-2-complete.md) - 구현된 컴포넌트

---

## 📝 주요 문서 설명

### 설계 문서 (01-DESIGN/)

- **chart-erd.md**: 데이터베이스 스키마 (ChartData, VolatilitySnapshots, BettingMarkers)
- **ui-mockup-design.md**: UI 레이아웃 및 컴포넌트 구조
- **tech-stack-decision.md**: Recharts, Zustand, Socket.IO 선정 근거

### 진행 상황 (03-PROGRESS/)

- **week-1-complete.md**: Week 1 설계 작업 완료
- **week-2-complete.md**: Week 2 UI 구현 완료

---

## ⚠️ 중복/구버전 문서 (참고만)

다음 문서들은 정리되었습니다:

- ~~task-week1.md~~ → week-1-complete.md로 통합
- ~~WEEK1-SUMMARY.md~~ → week-1-complete.md로 통합
- ~~week-2-ui-complete.md~~ → week-2-complete.md로 통합
- ~~week-2-presentation.md~~ → week-2-complete.md로 통합
- ~~INDEX.md~~ → 00-INDEX.md로 개선

---

## 🔄 업데이트 이력

| 날짜       | 내용                        |
| ---------- | --------------------------- |
| 2025-11-12 | 문서 구조 재정리, 중복 제거 |
| 2025-11-11 | Week 2 UI 구현 완료         |
| 2025-11-11 | Week 1 설계 완료            |

---

**다음 업데이트 예정**: Week 3 API 구현 완료 시
