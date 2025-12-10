export type RawRankingRow = {
  userId: string;
  walletAddress: string | null;
  delBalance: number | null;
  achievementTotal: number;
  totalAsset: number;
};

export type RankingItem = {
  walletAddress: string;
  delBalance: number;
  achievementTotal: number;
  totalAsset: number;
};
