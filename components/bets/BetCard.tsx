'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { useChartData } from '@/hooks/useChartData';
import { usePlaceBet } from '@/hooks/usePlaceBet';
import { useClaim } from '@/hooks/useClaim';
import { useDelCoins } from '@/hooks/useDelCoins';
import { useCurrentRound, RoundType } from '@/hooks/useCurrentRound';
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { ConnectWalletButton } from '@/components/wallet/ConnectWalletButton';
import SpreadCandlestickChart from '@/components/charts/SpreadCandlestickChart';

interface BetCardProps {
  roundType?: RoundType;
}

const SUISCAN_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet') as
  | 'testnet'
  | 'mainnet'
  | 'devnet';

function getSuiscanTxUrl(digest: string) {
  return `https://suiscan.xyz/${SUISCAN_NETWORK}/tx/${digest}`;
}

// 차트 데이터 타입
interface ChartDataPoint {
  timestamp: Date;
  close: number;
}

// 하이드레이션 안전한 마운트 체크 (useSyncExternalStore 패턴)
const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

function useHasMounted() {
  return useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
}

// 미니 차트 컴포넌트
function MiniChart({ data, color }: { data: ChartDataPoint[] | undefined; color: string }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-stone-400 text-sm">
        Loading...
      </div>
    );
  }

  // 데이터 샘플링 (50개로 줄이기)
  const sampleData = (arr: ChartDataPoint[], maxPoints: number = 50) => {
    if (arr.length <= maxPoints) return arr;
    const step = Math.floor(arr.length / maxPoints);
    return arr.filter((_, index) => index % step === 0);
  };

  const sampledData = sampleData(data, 50);

  const chartData = sampledData.map((d) => ({
    time: d.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    price: d.close,
  }));

  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;

  const paddingByPercent = range * 0.001;
  const paddingByFixed = maxPrice * 0.0001;
  const padding = Math.min(paddingByPercent, paddingByFixed);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData}>
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" hide />
        <YAxis hide domain={[minPrice - padding, maxPrice + padding]} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke={color}
          fillOpacity={1}
          fill={`url(#gradient-${color})`}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function BetCard({ roundType = 'DEMO_3MIN' }: BetCardProps) {
  const account = useCurrentAccount();
  const { placeBet, loading: betLoading } = usePlaceBet();
  const { claim, loading: claimLoading } = useClaim();
  const {
    primaryCoin,
    totalBalanceFormatted,
    isLoading: delLoading,
    selectCoinsForBet,
  } = useDelCoins();
  const { round, canBet, isLoading: roundLoading } = useCurrentRound(roundType);
  const [selectedAsset, setSelectedAsset] = useState<'GOLD' | 'BTC' | null>(null);
  const [amount, setAmount] = useState('');
  const [betResult, setBetResult] = useState<{ success: boolean; message: string } | null>(null);
  const [lastBetTxDigest, setLastBetTxDigest] = useState<string>('');
  const [myBets, setMyBets] = useState<
    Array<{
      id: string;
      prediction: string;
      amount: number;
      resultStatus: string | null;
      chainStatus?: string | null;
      payoutAmount?: number | null;
      suiTxHash?: string | null;
      suiPayoutTxHash?: string | null;
      // UI derived: DB에는 claimed 컬럼이 없고, payout tx가 있으면 "클레임 완료"로 간주
      claimed: boolean;
    }>
  >([]);
  const [claimResult, setClaimResult] = useState<{ success: boolean; message: string } | null>(
    null,
  );
  const [lastClaimTxDigest, setLastClaimTxDigest] = useState<string>('');

  const isMounted = useHasMounted();

  // 내 베팅 불러오기
  useEffect(() => {
    if (!account?.address || !round?.id) return;

    const fetchMyBets = async () => {
      try {
        const res = await fetch(`/api/bets?roundId=${round.id}`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (data.success && data.data) {
          const rows = Array.isArray(data.data) ? data.data : [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped = rows.map((b: any) => ({
            id: String(b.id),
            prediction: String(b.prediction),
            amount: Number(b.amount),
            resultStatus: (b.resultStatus ?? null) as string | null,
            chainStatus: (b.chainStatus ?? null) as string | null,
            payoutAmount: typeof b.payoutAmount === 'number' ? b.payoutAmount : null,
            suiTxHash: (b.suiTxHash ?? null) as string | null,
            suiPayoutTxHash: (b.suiPayoutTxHash ?? null) as string | null,
            claimed: !!b.suiPayoutTxHash,
          }));
          setMyBets(mapped);
          console.log('My bets for round', round.id, ':', mapped);
        }
      } catch (err) {
        console.error('Failed to fetch my bets:', err);
      }
    };

    fetchMyBets();
    const interval = setInterval(fetchMyBets, 5000);
    return () => clearInterval(interval);
  }, [account?.address, round?.id]);

  // 승리 베팅 (클레임 가능)
  // round.winner와 bet.prediction을 직접 비교해서 승자 판정
  const winningBets = myBets.filter((bet) => {
    if (bet.claimed) return false;

    const status = round?.status as string;

    // VOIDED 라운드는 모두 환불 대상 (클레임 가능)
    if (status === 'VOIDED') return true;

    // SETTLED 상태에서는 round.winner와 비교
    if (status === 'SETTLED' && round?.winner) {
      // 실제 승자와 내 예측이 일치해야만 승리
      return bet.prediction === round.winner;
    }

    return false;
  });

  // 이미 클레임된 승리/환불 베팅(=DB에 suiPayoutTxHash 존재)
  const claimedWinningBets = myBets.filter((bet) => {
    if (!bet.claimed) return false;
    const status = round?.status as string;
    if (status === 'VOIDED') return true;
    if (status === 'SETTLED' && round?.winner) {
      return bet.prediction === round.winner;
    }
    return false;
  });

  const handleClaim = async (betId: string) => {
    setClaimResult(null);
    setLastClaimTxDigest('');
    const result = await claim({ betId });
    if (result.success) {
      setClaimResult({ success: true, message: '클레임 성공!' });
      if (result.digest) setLastClaimTxDigest(result.digest);
      // 베팅 목록 새로고침
      setMyBets((prev) => prev.map((b) => (b.id === betId ? { ...b, claimed: true } : b)));
    } else {
      // 이미 클레임된 경우: DB에 있는 payout tx hash로 SuiScan 링크를 보여주기 위해 state를 활용
      const alreadyClaimedBet = myBets.find((b) => b.id === betId && b.suiPayoutTxHash);
      if (alreadyClaimedBet?.suiPayoutTxHash) {
        setLastClaimTxDigest(alreadyClaimedBet.suiPayoutTxHash);
        setClaimResult({ success: true, message: '이미 클레임 완료된 베팅입니다.' });
      } else {
        setClaimResult({ success: false, message: result.error || '클레임 실패' });
      }
    }
  };

  // 차트 데이터 자동 수집 트리거 (10초마다)
  useEffect(() => {
    const triggerCollection = async () => {
      try {
        await fetch('/api/chart/collect', { method: 'POST' });
      } catch (error) {
        console.error('Chart collection failed:', error);
      }
    };

    triggerCollection();
    const interval = setInterval(triggerCollection, 10000);
    return () => clearInterval(interval);
  }, []);

  // 차트 데이터 (5초마다 갱신)
  const { data: goldData } = useChartData('PAXG', '1h', 5000);
  const { data: btcData } = useChartData('BTC', '1h', 5000);

  // 30분 기준 타임스탬프 (클라이언트에서만 계산)
  const [filterTimestamp, setFilterTimestamp] = useState<number>(0);

  useEffect(() => {
    const updateFilter = () => setFilterTimestamp(Date.now() - 30 * 60 * 1000);
    updateFilter();
    const interval = setInterval(updateFilter, 5000);
    return () => clearInterval(interval);
  }, []);

  // 최근 30분 데이터만 필터링
  const goldData30 = filterTimestamp
    ? goldData?.filter((d: ChartDataPoint) => d.timestamp >= new Date(filterTimestamp))
    : goldData;

  const btcData30 = filterTimestamp
    ? btcData?.filter((d: ChartDataPoint) => d.timestamp >= new Date(filterTimestamp))
    : btcData;

  // 실시간 가격 (차트 데이터에서 마지막 값 추출)
  const currentGoldPrice =
    goldData30 && goldData30.length > 0 ? goldData30[goldData30.length - 1].close : 0;
  const currentBtcPrice =
    btcData30 && btcData30.length > 0 ? btcData30[btcData30.length - 1].close : 0;

  // 변동률 계산
  const calculateChangePercent = (data: ChartDataPoint[] | undefined) => {
    if (!data || data.length < 2) return 0;
    const first = data[0].close;
    const last = data[data.length - 1].close;
    return ((last - first) / first) * 100;
  };

  const goldChangePercent = calculateChangePercent(goldData30);
  const btcChangePercent = calculateChangePercent(btcData30);

  // 락 상태인지 확인
  const isLocked = round?.status === 'BETTING_LOCKED';
  // 정산 완료 상태인지 확인 (SETTLED 또는 VOIDED)
  const isSettled = round?.status === 'SETTLED' || round?.status === 'VOIDED';
  // 정산 중인지 확인
  const isSettling = round?.status === 'SETTLING';

  const handleBet = async () => {
    if (!selectedAsset || !amount) {
      setBetResult({ success: false, message: '자산과 금액을 선택해주세요' });
      return;
    }

    if (!account) {
      setBetResult({ success: false, message: '지갑을 먼저 연결해주세요' });
      return;
    }

    if (!primaryCoin) {
      setBetResult({ success: false, message: 'DEL 토큰이 없습니다' });
      return;
    }

    if (!round || !canBet) {
      setBetResult({ success: false, message: '현재 베팅이 불가능합니다' });
      return;
    }

    setBetResult(null);
    setLastBetTxDigest('');

    // 베팅 금액에 필요한 코인들 자동 선택
    let selectedCoinIds: string[];
    try {
      selectedCoinIds = selectCoinsForBet(parseInt(amount));
    } catch (err) {
      setBetResult({
        success: false,
        message: err instanceof Error ? err.message : '코인 선택 실패',
      });
      return;
    }

    const result = await placeBet({
      roundId: round.id,
      prediction: selectedAsset,
      amount: parseInt(amount),
      userDelCoinIds: selectedCoinIds,
    });

    if (result.success) {
      setBetResult({ success: true, message: '베팅 성공!' });
      if (result.digest) setLastBetTxDigest(result.digest);
      setAmount('');
      setSelectedAsset(null);
    } else {
      setBetResult({ success: false, message: result.error || '베팅 실패' });
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto bg-white rounded-lg shadow-xl border border-stone-200 overflow-hidden">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-stone-50 to-amber-50 px-6 py-4 border-b border-stone-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-stone-600 mt-0.5">
              {roundLoading
                ? '로딩중...'
                : round
                  ? `라운드 #${round.roundNumber} ${isSettled ? '🏆 종료' : isLocked ? '🔒 베팅 마감' : '🟢 베팅 가능'}`
                  : '라운드 없음'}
            </p>
          </div>
          <div className="text-right">
            {isMounted &&
              (!account ? (
                <ConnectWalletButton />
              ) : (
                <>
                  <p className="text-xs text-stone-500">잔액</p>
                  <p className="text-lg font-semibold text-stone-800">
                    {delLoading ? '...' : `${totalBalanceFormatted} DEL`}
                  </p>
                  <p className="text-xs text-stone-400">
                    {account.address.slice(0, 6)}...{account.address.slice(-4)}
                  </p>
                </>
              ))}
          </div>
        </div>
      </div>

      {/* 정산 완료 상태: 모든 유저에게 결과 표시 */}
      {isSettled && (
        <div className="p-6 bg-gradient-to-b from-gray-900 to-gray-800 rounded-b-lg">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🏆</div>
            <h3 className="text-2xl font-bold text-white mb-2">
              라운드 #{round?.roundNumber} 종료!
            </h3>
            {round?.winner ? (
              <div
                className={`text-3xl font-extrabold ${round.winner === 'GOLD' ? 'text-yellow-400' : 'text-orange-400'}`}
              >
                {round.winner === 'GOLD' ? '🥇 GOLD 승리!' : '₿ BTC 승리!'}
              </div>
            ) : (
              <div className="text-xl text-gray-400">결과 집계 중...</div>
            )}
          </div>

          {/* 승패 안내 */}
          {round?.winner && (
            <div className="space-y-3">
              {/* 승리 베팅 있을 때: 클레임 버튼 */}
              {winningBets.length > 0 ? (
                <div className="bg-green-900/40 border border-green-500/50 rounded-lg p-4">
                  <p className="text-green-300 font-semibold mb-3 text-center">
                    🎉 축하합니다! {winningBets.length}개의 승리 베팅이 있습니다!
                  </p>
                  <div className="space-y-2">
                    {winningBets.map((bet) => (
                      <div
                        key={bet.id}
                        className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3"
                      >
                        <div className="text-white">
                          <span className="font-semibold">{bet.prediction}</span>
                          <span className="text-gray-400 ml-2">{bet.amount} DEL</span>
                        </div>
                        <button
                          onClick={() => handleClaim(bet.id)}
                          disabled={claimLoading}
                          className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-lg hover:from-green-400 hover:to-emerald-400 transition-all disabled:opacity-50"
                        >
                          {claimLoading ? '처리중...' : '💰 클레임'}
                        </button>
                      </div>
                    ))}
                  </div>
                  {claimResult && (
                    <div
                      className={`mt-3 p-2 rounded text-center text-sm ${claimResult.success ? 'bg-green-800/50 text-green-300' : 'bg-red-800/50 text-red-300'}`}
                    >
                      {claimResult.message}
                      {claimResult.success && lastClaimTxDigest && (
                        <div className="mt-2">
                          <a
                            href={getSuiscanTxUrl(lastClaimTxDigest)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-green-200 underline hover:text-green-100 break-all"
                          >
                            SuiScan에서 클레임 TX 보기
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : claimedWinningBets.length > 0 ? (
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                  <p className="text-green-200 font-semibold mb-3 text-center">
                    ✅ 이미 클레임 완료: {claimedWinningBets.length}건
                  </p>
                  <div className="space-y-2">
                    {claimedWinningBets.map((bet) => (
                      <div
                        key={bet.id}
                        className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3"
                      >
                        <div className="text-white">
                          <span className="font-semibold">{bet.prediction}</span>
                          <span className="text-gray-400 ml-2">{bet.amount} DEL</span>
                        </div>
                        {bet.suiPayoutTxHash ? (
                          <a
                            href={getSuiscanTxUrl(bet.suiPayoutTxHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-green-200 underline hover:text-green-100"
                          >
                            SuiScan
                          </a>
                        ) : (
                          <span className="text-gray-500 text-sm">TX 없음</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : myBets.length > 0 ? (
                /* 베팅했지만 졌을 때 */
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <p className="text-gray-300 text-lg mb-1">
                    아쉽지만 이번 라운드는 패배하셨습니다 😢
                  </p>
                  <p className="text-gray-400 text-sm">다음 라운드에서 다시 도전해보세요! 💪</p>
                </div>
              ) : (
                /* 베팅 안 했을 때 */
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <p className="text-gray-400">이번 라운드에 베팅하지 않으셨습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lock 또는 Settling 상태: 스프레드 차트 */}
      {(isLocked || isSettling) && (
        <div className="p-6 bg-gray-900 rounded-b-lg">
          <SpreadCandlestickChart
            height={280}
            period="1h"
            refreshInterval={isSettling ? 0 : 5000}
            maxDataPoints={30}
          />
          <p className="text-center text-gray-400 text-sm mt-4">
            {isSettling ? '정산 중... ⏳' : '라운드 종료 대기중... ⏱️'}
          </p>
        </div>
      )}

      {/* 베팅 가능 상태: 차트 + 베팅 UI */}
      {canBet && (
        <>
          <div className="grid grid-cols-2 gap-6 p-6">
            {/* GOLD 섹션 */}
            <div className="space-y-4">
              <button
                onClick={() => setSelectedAsset('GOLD')}
                className={`
                  w-full p-4 rounded-lg border-2 transition-all duration-200
                  ${
                    selectedAsset === 'GOLD'
                      ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-600 shadow-lg'
                      : 'bg-stone-50 border-stone-200 hover:border-yellow-400 hover:shadow-md'
                  }
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-stone-800">금 (PAXG)</h3>
                    <p className="text-sm text-stone-500">PAXG/USDT</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-stone-800">
                      $
                      {currentGoldPrice.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p
                      className={`text-xs ${goldChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {goldChangePercent >= 0 ? '+' : ''}
                      {goldChangePercent.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </button>

              {/* GOLD 차트 */}
              <div className="h-32 bg-stone-50 rounded-lg p-2 border border-stone-200">
                <MiniChart data={goldData30} color="#eab308" />
              </div>
            </div>

            {/* BTC 섹션 */}
            <div className="space-y-4">
              <button
                onClick={() => setSelectedAsset('BTC')}
                className={`
                  w-full p-4 rounded-lg border-2 transition-all duration-200
                  ${
                    selectedAsset === 'BTC'
                      ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-600 shadow-lg'
                      : 'bg-stone-50 border-stone-200 hover:border-orange-400 hover:shadow-md'
                  }
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-stone-800">비트코인 (BTC)</h3>
                    <p className="text-sm text-stone-500">BTC/USDT</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-stone-800">
                      $
                      {currentBtcPrice.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p
                      className={`text-xs ${btcChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {btcChangePercent >= 0 ? '+' : ''}
                      {btcChangePercent.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </button>

              {/* BTC 차트 */}
              <div className="h-32 bg-stone-50 rounded-lg p-2 border border-stone-200">
                <MiniChart data={btcData30} color="#f97316" />
              </div>
            </div>
          </div>

          {/* 베팅 입력 섹션 */}
          <div className="px-6 pb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                베팅 금액 (DEL)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="금액 입력"
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-lg text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500 text-sm font-medium">
                  DEL
                </div>
              </div>

              {/* 빠른 선택 */}
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[100, 500, 1000, 5000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset.toString())}
                    className="px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-md text-stone-700 hover:bg-stone-100 hover:border-stone-400 transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* 베팅 결과 메시지 */}
            {betResult && (
              <div
                className={`px-4 py-3 rounded-lg text-sm ${
                  betResult.success
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {betResult.message}
                {betResult.success && lastBetTxDigest && (
                  <div className="mt-2">
                    <a
                      href={getSuiscanTxUrl(lastBetTxDigest)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-green-700 underline hover:text-green-800 break-all"
                    >
                      SuiScan에서 베팅 TX 보기
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* 베팅 버튼 */}
            <button
              onClick={handleBet}
              disabled={!selectedAsset || !amount || betLoading || !canBet}
              className={`
                w-full py-3.5 rounded-lg font-semibold text-base transition-all duration-200
                ${
                  selectedAsset && amount && !betLoading && canBet
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700 shadow-md hover:shadow-lg'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }
              `}
            >
              {betLoading && '서명 중...'}
              {!betLoading && !selectedAsset && !amount && '자산과 금액을 선택하세요'}
              {!betLoading && !selectedAsset && amount && '자산을 선택하세요'}
              {!betLoading && selectedAsset && !amount && '금액을 입력하세요'}
              {!betLoading &&
                selectedAsset &&
                amount &&
                `${selectedAsset}에 ${amount} DEL 베팅하기`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
