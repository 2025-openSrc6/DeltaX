export type RawRankingRow = {
  userId: string;
  walletAddress: string | null;
  nickname: string | null;
  nicknameColor: string | null;
  profileColor: string | null;
  delBalance: number | null;
  achievementTotal: number;
  totalAsset: number;
};

export type RankingItem = {
  walletAddress: string;
  nickname: string | null;
  nicknameColor: string | null;
  profileColor: string | null;
  delBalance: number;
  achievementTotal: number;
  totalAsset: number;
};
