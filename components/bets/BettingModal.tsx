'use client';

import { BetCard } from '@/components/bets/BetCard';
import { useCurrentRound, RoundType } from '@/hooks/useCurrentRound';

interface BettingModalProps {
  isOpen: boolean;
  onClose: () => void;
  roundType?: RoundType;
}

export function BettingModal({ isOpen, onClose, roundType = 'DEMO_3MIN' }: BettingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 컨텐츠 */}
      <div className="relative z-10 w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto rounded-lg scrollbar-thin scrollbar-thumb-stone-400 scrollbar-track-transparent">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-20 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* BetCard */}
        <BetCard roundType={roundType} />
      </div>
    </div>
  );
}

// 베팅 버튼 컴포넌트 (Quick Actions용)
interface BettingButtonProps {
  roundType?: RoundType;
  onClick: () => void;
  className?: string;
}

export function BettingButton({
  roundType = 'DEMO_3MIN',
  onClick,
  className = '',
}: BettingButtonProps) {
  const { round, canBet, isLoading } = useCurrentRound(roundType);

  // NOTE:
  // canBet=false(베팅 마감/정산/베팅 불가)이어도 모달은 열 수 있어야 한다.
  // - 유저는 베팅 결과/클레임 확인을 위해 다시 들어와야 함.
  const isDisabled = isLoading || !round;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        px-6 py-3 rounded-lg font-semibold transition-all duration-200
        ${
          isDisabled
            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-md hover:shadow-lg'
        }
        ${className}
      `}
    >
      {isLoading && '로딩중...'}
      {!isLoading && !round && '라운드 없음'}
      {!isLoading && round && !canBet && '베팅 마감'}
      {!isLoading && round && canBet && '🎯 베팅하기'}
    </button>
  );
}
