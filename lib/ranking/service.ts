import type { RankingItem } from './types';
import { fetchRankingRows } from './repository';

/**
 * limit명까지 랭킹 결과 반환
 * - DB에서 이미 집계 및 정렬된 데이터를 받아옴
 * - users.delBalance + achievements.purchasePrice 합산은 DB에서 처리
 * - totalAsset 기준 내림차순 정렬도 DB에서 처리
 */
export async function getRanking(limit: number): Promise<RankingItem[]> {
  const rows = await fetchRankingRows(limit);

  // DB에서 이미 집계/정렬된 데이터를 RankingItem 형태로 변환
  const ranking: RankingItem[] = rows.map((row) => ({
    walletAddress: row.walletAddress ?? '',
    nickname: row.nickname ?? null,
    nicknameColor: row.nicknameColor ?? null,
    profileColor: row.profileColor ?? null,
    delBalance: Number(row.delBalance ?? 0),
    achievementTotal: Number(row.achievementTotal ?? 0),
    totalAsset: Number(row.totalAsset ?? 0),
  }));

  return ranking;
}
