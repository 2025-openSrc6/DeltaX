'use client';

import { useState } from 'react';
import { useMyBets, Bet, ResultStatus } from '@/hooks/useMyBets';
import { useClaim } from '@/hooks/useClaim';

interface MyBetsListProps {
  roundId?: string;
}

// 결과 상태에 따른 스타일
const getResultStyle = (status: ResultStatus) => {
  switch (status) {
    case 'WON':
      return 'bg-green-100 text-green-700';
    case 'LOST':
      return 'bg-red-100 text-red-700';
    case 'PENDING':
      return 'bg-amber-100 text-amber-700';
    case 'REFUNDED':
      return 'bg-blue-100 text-blue-700';
    case 'FAILED':
      return 'bg-stone-100 text-stone-700';
    default:
      return 'bg-stone-100 text-stone-500';
  }
};

// 결과 상태 한글 변환
const getResultLabel = (status: ResultStatus) => {
  switch (status) {
    case 'WON':
      return '승리';
    case 'LOST':
      return '패배';
    case 'PENDING':
      return '진행중';
    case 'REFUNDED':
      return '환불';
    case 'FAILED':
      return '실패';
    default:
      return status;
  }
};

// 예측 라벨
const getPredictionLabel = (prediction: 'GOLD' | 'BTC') => {
  return prediction === 'GOLD' ? '금 (PAXG)' : '비트코인 (BTC)';
};

// 클레임 버튼 컴포넌트
function ClaimButton({ bet, onClaimed }: { bet: Bet; onClaimed?: () => void }) {
  const { claim, loading } = useClaim();
  const [claimResult, setClaimResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleClaim = async () => {
    setClaimResult(null);
    const result = await claim({ betId: bet.id });

    if (result.success) {
      setClaimResult({
        success: true,
        message: `+${result.payoutAmount?.toLocaleString()} DEL 수령!`,
      });
      onClaimed?.();
    } else {
      setClaimResult({
        success: false,
        message: result.error || '클레임 실패',
      });
    }
  };

  // 이미 클레임됨
  if (bet.settlementStatus === 'COMPLETED') {
    return (
      <span className="px-3 py-1.5 text-xs font-medium bg-stone-100 text-stone-500 rounded-lg">
        ✓ 수령 완료
      </span>
    );
  }

  // 클레임 결과 표시
  if (claimResult?.success) {
    return (
      <span className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg">
        {claimResult.message}
      </span>
    );
  }

  return (
    <button
      onClick={handleClaim}
      disabled={loading}
      className={`
        px-3 py-1.5 text-xs font-semibold rounded-lg transition-all
        ${loading
          ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
          : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-sm hover:shadow'
        }
      `}
    >
      {loading ? '처리중...' : '💰 클레임'}
    </button>
  );
}

// 개별 베팅 카드
function BetCard({ bet, onClaimed }: { bet: Bet; onClaimed?: () => void }) {
  const date = new Date(bet.createdAt);
  const formattedDate = date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // 클레임 가능 여부 (승리 + 아직 클레임 안 함)
  const canClaim = bet.resultStatus === 'WON' && bet.settlementStatus !== 'COMPLETED';

  return (
    <div className="flex items-center justify-between p-4 bg-white border border-stone-200 rounded-lg hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-4">
        {/* 예측 아이콘 */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${bet.prediction === 'GOLD'
              ? 'bg-yellow-100 text-yellow-600'
              : 'bg-orange-100 text-orange-600'
            }`}
        >
          {bet.prediction === 'GOLD' ? '🪙' : '₿'}
        </div>

        {/* 베팅 정보 */}
        <div>
          <p className="font-medium text-stone-800">{getPredictionLabel(bet.prediction)}</p>
          <p className="text-sm text-stone-500">{formattedDate}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* 베팅 금액 & 결과 */}
        <div className="text-right">
          <p className="font-semibold text-stone-800">
            {bet.amount.toLocaleString()} {bet.currency}
          </p>
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getResultStyle(bet.resultStatus)}`}
          >
            {getResultLabel(bet.resultStatus)}
            {bet.payoutAmount && bet.resultStatus === 'WON' && (
              <span className="ml-1">+{bet.payoutAmount.toLocaleString()}</span>
            )}
          </span>
        </div>

        {/* 클레임 버튼 (승리한 경우만) */}
        {(canClaim || bet.settlementStatus === 'COMPLETED') && (
          <ClaimButton bet={bet} onClaimed={onClaimed} />
        )}
      </div>
    </div>
  );
}

export function MyBetsList({ roundId }: MyBetsListProps) {
  const { bets, isLoading, error, hasBets, totalBets, refetch } = useMyBets({ roundId });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-stone-200 rounded w-1/3"></div>
          <div className="h-16 bg-stone-100 rounded"></div>
          <div className="h-16 bg-stone-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        베팅 내역을 불러오는데 실패했습니다: {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-stone-200 bg-stone-50">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-stone-800">내 베팅 내역</h3>
          <span className="text-sm text-stone-500">총 {totalBets}건</span>
        </div>
      </div>

      {/* 베팅 리스트 */}
      <div className="p-4 space-y-3">
        {!hasBets ? (
          <div className="text-center py-8 text-stone-500">
            <p className="text-lg mb-1">📋</p>
            <p>아직 베팅 내역이 없습니다</p>
            <p className="text-sm">첫 베팅을 시작해보세요!</p>
          </div>
        ) : (
          bets.map((bet: Bet) => <BetCard key={bet.id} bet={bet} onClaimed={refetch} />)
        )}
      </div>
    </div>
  );
}

