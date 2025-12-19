'use client';

import { useState } from 'react';
import { BettingModal, BettingButton } from '@/components/bets/BettingModal';
import { BetCard } from '@/components/bets/BetCard';

export default function BettingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-stone-100 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-8">
        <h1 className="text-2xl font-bold text-stone-800">베팅 테스트 페이지</h1>

        {/* 테스트 버튼들 */}
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <h2 className="font-semibold text-stone-700">Quick Actions 버튼 테스트</h2>

          <div className="flex gap-4">
            {/* 실제 버튼 (라운드 없으면 비활성화) */}
            <BettingButton onClick={() => setIsModalOpen(true)} />

            {/* 테스트 버튼 (항상 활성화) */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-amber-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-amber-600"
            >
              🧪 테스트 모달
            </button>
          </div>
        </div>

        {/* 직접 BetCard */}
        <div>
          <h2 className="font-semibold text-stone-700 mb-4">BetCard 직접 보기</h2>
          <BetCard />
        </div>
      </div>

      {/* 모달 */}
      <BettingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
