import { BetCard } from '@/components/bets/BetCard';

export default function BettingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-amber-50/30 to-orange-50/30 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* 페이지 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-800 mb-2">DeltaX Betting Platform</h1>
          <p className="text-stone-600">Predict the winning asset: GOLD vs BITCOIN</p>
        </div>

        {/* 베팅 카드 */}
        <BetCard />
      </div>
    </div>
  );
}
