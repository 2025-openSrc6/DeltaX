# NFT Shop 및 민팅 구현 요약

## 1. 개요

본 문서는 DeltaX 프로젝트의 NFT 상점 기능, 아이템 구매, 그리고 Sui 블록체인 기반 NFT 민팅 구현에 대한 핵심 소스코드와 로직을 요약합니다.

## 2. 주요 기능

- **상점 페이지**: 닉네임 변경권, 컬러, 부스트, NFT 등 다양한 아이템 판매.
- **아이템 구매**: DEL/CRYSTAL 재화를 사용하여 아이템 구매 시 즉시 효과 적용 (DB 업데이트).
- **NFT 민팅**: NFT 구매 시 Sui 블록체인 상에서 즉시 NFT 발행 (Sui Display Standard 활용).
- **Pinata 연동**: 실제 IPFS 이미지를 사용하여 NFT 메타데이터 연결.

## 3. 요구사항 구현 현황

| #   | 요구사항                                           | 구현 상태 | 구현 위치                                                                                    |
| --- | -------------------------------------------------- | :-------: | -------------------------------------------------------------------------------------------- |
| 1   | 닉네임 변경 상품 구매 시 닉네임 변경 + DB update   |    ✅     | [route.ts:76-86](file:///c:/2025-openSrc6/backend/app/api/nfts/purchase/route.ts#L76-86)     |
| 2   | 닉네임 컬러 상품 구매 시 무지개색 변경 + DB update |    ✅     | [route.ts:88-93](file:///c:/2025-openSrc6/backend/app/api/nfts/purchase/route.ts#L88-93)     |
| 3   | NFT 구매 시 Pinata CID로 minting + DB update       |    ✅     | [route.ts:109-152](file:///c:/2025-openSrc6/backend/app/api/nfts/purchase/route.ts#L109-152) |
| 4   | 부스트 상품 구매 시 버프 적용 (1일) + DB update    |    ✅     | [route.ts:95-103](file:///c:/2025-openSrc6/backend/app/api/nfts/purchase/route.ts#L95-103)   |
| 5   | Green Mushroom 구매 시 + DB update                 |    ✅     | [route.ts:105-107](file:///c:/2025-openSrc6/backend/app/api/nfts/purchase/route.ts#L105-107) |
| 6   | 모든 아이템 tier에 맞게 리스트                     |    ✅     | [seed-shop-items.ts](file:///c:/2025-openSrc6/backend/scripts/seed-shop-items.ts)            |

## 4. 핵심 소스코드

### 4.1. DB 스키마 (`db/schema`)

- **`shopItems.ts`**: 상점 아이템 정보 (가격, 카테고리, 이미지 URL 등) 정의.
- **`users.ts`**: 유저 정보에 `nicknameColor`, `boostUntil`, `greenMushrooms` 등 아이템 효과 필드 추가.
- **`achievements.ts`**: 구매한 아이템 및 NFT 보유 내역 저장.

### 4.2. API (`app/api/nfts/purchase/route.ts`)

구매 요청을 처리하는 핵심 로직입니다.

1. **유효성 검사**: 아이템 존재 여부, 잔액 확인, 닉네임 필수 여부 등 체크.
2. **아이템별 로직**:
   - **NICKNAME**: `users.nickname` 즉시 변경.
   - **COLOR**: `users.nicknameColor` 업데이트 (metadata.color 활용).
   - **BOOST**: `users.boostUntil` 시간 연장 (metadata.durationMs 활용, 기본 1일).
   - **ITEM**: `users.greenMushrooms` 수량 증가.
   - **NFT**: `mintNFT` 함수 호출하여 Sui 체인에 NFT 발행.
3. **트랜잭션**: 잔액 차감, 포인트 거래 기록, 아이템 지급(DB)을 원자적으로 처리.

### 4.3. Sui Move Contract (`contracts/sources/nft.move`)

Sui 블록체인에 배포될 NFT 컨트랙트입니다.

- **`DeltaxNFT` Struct**: `name`, `description`, `url`, `tier` 필드 보유.
- **`init` 함수**: **Sui Display Standard**를 설정하여, 별도의 메타데이터 서버 없이도 지갑에서 이미지가 바로 보이도록 설정.
- **`mint_nft` 함수**: 지정된 `url`(이미지 CID)을 포함한 NFT를 생성하여 유저에게 전송.

### 4.4. Sui Client Helper (`lib/sui/nft.ts`)

Node.js 환경에서 Sui 블록체인과 통신하는 헬퍼 함수입니다.

- **`mintNFT`**: Admin 지갑(서버)이 가스비를 대납하고, 유저의 주소로 NFT를 민팅하는 트랜잭션을 생성 및 실행.

### 4.5. Pinata IPFS (`lib/ipfs/pinata.ts`)

- **`uploadMetadataToPinata`**: JSON 메타데이터 업로드
- **`uploadImageToPinata`**: 이미지 파일 업로드

## 5. 변경 사항 요약 (2025-12-08)

### 수정된 파일

| 파일                                 | 변경 내용                                                              |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `app/api/nfts/purchase/route.ts`     | COLOR: metadata.color 활용, BOOST: metadata.durationMs 활용 (기본 1일) |
| `scripts/seed-shop-items.ts`         | COLOR/BOOST 아이템에 metadata 필드 추가                                |
| `docs/Arthur/implementation_plan.md` | 요구사항 매핑 추가, 상세 구현 로직 문서화                              |
| `docs/Arthur/task.md`                | 작업 진행 상황 업데이트                                                |

## 6. 향후 계획

- **Sui Testnet/Mainnet 배포**: 현재는 로컬/Mock 환경 또는 Devnet 가정을 하고 있으며, 실제 서비스 런칭 시 컨트랙트 배포 및 `PACKAGE_ID` 업데이트가 필요합니다.
