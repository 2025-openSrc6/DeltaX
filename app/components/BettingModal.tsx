'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, TrendingUp, TrendingDown, Clock, Loader2 } from 'lucide-react';
import type { Round } from '@/db/schema/rounds';

interface BettingModalProps {
  isOpen: boolean;
  onClose: () => void;
  round: Round | null;
  userAddress: string;
  onBetSuccess: () => void;
}

export function BettingModal({
  isOpen,
  onClose,
  round,
  userAddress,
  onBetSuccess,
}: BettingModalProps) {
  const [selectedPrediction, setSelectedPrediction] = useState<'GOLD' | 'BTC' | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setSelectedPrediction(null);
      setAmount('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !round) return null;

  // 베팅 가능 여부 확인
  const now = Date.now();
  const canBet = round.status === 'BETTING_OPEN' && now < round.lockTime;
  const timeRemaining = Math.max(0, Math.floor((round.lockTime - now) / 1000));
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPrediction || !amount) {
      setError('예측 방향과 금액을 입력해주세요.');
      return;
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount < 100) {
      setError('최소 베팅 금액은 100 DEL입니다.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/bets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          roundId: round.id,
          prediction: selectedPrediction,
          amount: betAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || '베팅에 실패했습니다.');
      }

      if (data.success) {
        onBetSuccess();
        onClose();
        // 성공 알림은 부모 컴포넌트에서 처리
      } else {
        throw new Error(data.error || '베팅에 실패했습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const goldBetsPercent =
    round.totalPool > 0 ? (round.totalGoldBets / round.totalPool) * 100 : 50;
  const btcBetsPercent = 100 - goldBetsPercent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <Card className="relative w-full max-w-md border border-slate-700/80 bg-slate-950/95 p-6 shadow-2xl">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        {/* 헤더 */}
        <div className="mb-6">
          <h2 className="mb-2 text-2xl font-bold text-slate-50">베팅하기</h2>
          <p className="text-sm text-slate-400">
            라운드 #{round.roundNumber} • {round.type}
          </p>
        </div>

        {/* 베팅 마감 타이머 */}
        {canBet && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-lg bg-cyan-500/10 px-4 py-3 text-cyan-300">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-semibold">
              베팅 마감까지 {minutes.toString().padStart(2, '0')}:
              {seconds.toString().padStart(2, '0')}
            </span>
          </div>
        )}

        {!canBet && (
          <div className="mb-6 rounded-lg bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
            베팅이 마감되었습니다.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 예측 선택 */}
          <div>
            <label className="mb-3 block text-sm font-semibold text-slate-200">
              어느 쪽이 더 오를까요?
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* GOLD 버튼 */}
              <button
                type="button"
                disabled={!canBet}
                onClick={() => setSelectedPrediction('GOLD')}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  selectedPrediction === 'GOLD'
                    ? 'border-yellow-500 bg-yellow-500/20 shadow-lg shadow-yellow-500/30'
                    : 'border-slate-700 bg-slate-900/50 hover:border-yellow-500/50 hover:bg-slate-900/80'
                } ${!canBet ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <TrendingUp className="h-8 w-8 text-yellow-400" />
                <span className="text-lg font-bold text-slate-50">GOLD</span>
                <span className="text-xs text-slate-400">
                  {goldBetsPercent.toFixed(1)}% 선택
                </span>
              </button>

              {/* BTC 버튼 */}
              <button
                type="button"
                disabled={!canBet}
                onClick={() => setSelectedPrediction('BTC')}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  selectedPrediction === 'BTC'
                    ? 'border-orange-500 bg-orange-500/20 shadow-lg shadow-orange-500/30'
                    : 'border-slate-700 bg-slate-900/50 hover:border-orange-500/50 hover:bg-slate-900/80'
                } ${!canBet ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <TrendingDown className="h-8 w-8 text-orange-400" />
                <span className="text-lg font-bold text-slate-50">BTC</span>
                <span className="text-xs text-slate-400">
                  {btcBetsPercent.toFixed(1)}% 선택
                </span>
              </button>
            </div>
          </div>

          {/* 금액 입력 */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-200">
              베팅 금액 (DEL)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="최소 100 DEL"
              min="100"
              step="10"
              disabled={!canBet}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-50 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="mt-2 flex gap-2">
              {[100, 500, 1000, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={!canBet}
                  onClick={() => setAmount(preset.toString())}
                  className="flex-1 rounded-md bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* 풀 정보 */}
          <div className="rounded-lg bg-slate-900/50 p-4 text-sm">
            <div className="mb-2 flex justify-between text-slate-400">
              <span>현재 총 풀</span>
              <span className="font-mono font-semibold text-cyan-300">
                {round.totalPool.toLocaleString()} DEL
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>총 베팅 수</span>
              <span className="font-semibold text-slate-300">{round.totalBetsCount}건</span>
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* 제출 버튼 */}
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={!canBet || loading || !selectedPrediction || !amount}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 font-semibold text-white shadow-lg shadow-cyan-500/30 hover:from-cyan-400 hover:to-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  처리 중...
                </>
              ) : (
                '베팅하기'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
