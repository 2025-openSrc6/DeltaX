'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { useChartData } from '@/hooks/useChartData';
import { usePlaceBet } from '@/hooks/usePlaceBet';
import { useDelCoins } from '@/hooks/useDelCoins';
import { useCurrentRound, RoundType } from '@/hooks/useCurrentRound';
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { ConnectWalletButton } from '@/components/wallet/ConnectWalletButton';

interface BetCardProps {
  roundType?: RoundType;
  goldPrice?: number;
  btcPrice?: number;
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

// 미니 차트 컴포넌트 (렌더 외부에 정의)
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

  // 데이터의 min/max 값을 구해서 Y축 범위 좁히기
  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;

  // 극한 압축: 0.1% 패딩 또는 고정값 중 작은 것
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

export function BetCard({
  roundType = '1MIN',
  goldPrice = 2650.5,
  btcPrice = 98234.0,
}: BetCardProps) {
  const account = useCurrentAccount();
  const { placeBet, loading: betLoading } = usePlaceBet();
  const { primaryCoin, totalBalanceFormatted, hasDel, isLoading: delLoading } = useDelCoins();
  const { round, canBet, isLoading: roundLoading } = useCurrentRound(roundType);
  const [selectedAsset, setSelectedAsset] = useState<'GOLD' | 'BTC' | null>(null);
  const [amount, setAmount] = useState('');
  const [betResult, setBetResult] = useState<{ success: boolean; message: string } | null>(null);

  const isMounted = useHasMounted();

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
      setBetResult({ success: false, message: 'DEL 토큰이 없습니다. 먼저 DEL을 획득해주세요.' });
      return;
    }

    if (!round || !canBet) {
      setBetResult({ success: false, message: '현재 베팅이 불가능합니다.' });
      return;
    }

    setBetResult(null);

    const result = await placeBet({
      roundId: round.id,
      prediction: selectedAsset,
      amount: parseInt(amount),
      userDelCoinId: primaryCoin.coinObjectId,
    });

    if (result.success) {
      setBetResult({
        success: true,
        message: `베팅 성공! TX: ${result.digest?.slice(0, 8)}...`,
      });
      setAmount('');
      setSelectedAsset(null);
    } else {
      setBetResult({
        success: false,
        message: result.error || '베팅 실패',
      });
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto bg-white rounded-lg shadow-xl border border-stone-200 overflow-hidden">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-stone-50 to-amber-50 px-6 py-4 border-b border-stone-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-stone-800">베팅하기</h2>
            <p className="text-sm text-stone-600 mt-0.5">
              {roundLoading ? '로딩중...' : round ? `라운드 #${round.roundNumber}` : '라운드 없음'}
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
                  ${goldPrice.toLocaleString('en-US')}
                </p>
                <p className="text-xs text-green-600">+2.4%</p>
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
                <p className="text-xl font-bold text-stone-800">${btcPrice.toLocaleString()}</p>
                <p className="text-xs text-red-600">-1.2%</p>
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
          <label className="block text-sm font-medium text-stone-700 mb-2">베팅 금액 (DEL)</label>
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

        {/* 예상 수익 */}
        {selectedAsset && amount && (
          <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-stone-600">예상 배당</span>
              <span className="font-semibold text-stone-800">2.5배</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-600">예상 수익</span>
              <span className="font-semibold text-green-700">
                +{(parseFloat(amount) * 1.5).toLocaleString()} DEL
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-2">* 실제 배당은 라운드 종료 시 결정됩니다</p>
          </div>
        )}

        {/* DEL 없음 경고 */}
        {isMounted && account && !delLoading && !hasDel && (
          <div className="px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-700 border border-amber-200">
            ⚠️ DEL 토큰이 없습니다. 출석 체크나 이벤트를 통해 DEL을 획득해주세요!
          </div>
        )}

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
          </div>
        )}

        {/* 베팅 버튼 */}
        <button
          onClick={handleBet}
          disabled={!selectedAsset || !amount || betLoading}
          className={`
            w-full py-3.5 rounded-lg font-semibold text-base transition-all duration-200
            ${
              selectedAsset && amount && !betLoading
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700 shadow-md hover:shadow-lg'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            }
          `}
        >
          {betLoading && '서명 중...'}
          {!betLoading && !selectedAsset && !amount && '자산과 금액을 선택하세요'}
          {!betLoading && !selectedAsset && amount && '자산을 선택하세요'}
          {!betLoading && selectedAsset && !amount && '금액을 입력하세요'}
          {!betLoading && selectedAsset && amount && `${selectedAsset}에 ${amount} DEL 베팅하기`}
        </button>
      </div>
    </div>
  );
}
