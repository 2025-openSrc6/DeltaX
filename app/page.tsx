'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowRight, Sparkles, BarChart3, Wallet, Zap, Activity, Calendar } from 'lucide-react';

import { RankingList } from '@/components/RankingList';
import { BettingModal } from '@/components/bets/BettingModal';
import { PAXGPriceChart, BTCPriceChart } from '@/components/charts';
import SpreadCandlestickChart from '@/components/charts/SpreadCandlestickChart';
import { VolatilityComparisonChart } from '@/app/chart/components/VolatilityComparisonChart';
import { PriceTrendChart } from '@/app/chart/components/PriceTrendChart';

// 실시간 관전 차트 섹션 (현재 사용되지 않음)
import {
  useCurrentWallet,
  useConnectWallet,
  useWallets,
  useDisconnectWallet,
  useSignPersonalMessage,
} from '@mysten/dapp-kit';
import { useToast } from '@/hooks/use-toast';
import { useAutoCollect } from '@/hooks/useAutoCollect';
import type { Round } from '@/db/schema/rounds';

const SUISCAN_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet') as
  | 'testnet'
  | 'mainnet'
  | 'devnet';

function getSuiscanObjectUrl(objectId: string) {
  return `https://suiscan.xyz/${SUISCAN_NETWORK}/object/${objectId}`;
}

function getSuiscanTxUrl(digest: string) {
  return `https://suiscan.xyz/${SUISCAN_NETWORK}/tx/${digest}`;
}

// 차트 데이터 타입 정의
type HistoricalDataPoint = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volatility: number | null;
};

type ComparisonData = {
  asset1: {
    name: string;
    volatility: number;
    return: number;
    adjustedReturn: number;
    currentPrice: number;
    startPrice: number;
    dataPoints: number;
  };
  asset2: {
    name: string;
    volatility: number;
    return: number;
    adjustedReturn: number;
    currentPrice: number;
    startPrice: number;
    dataPoints: number;
  };
  comparison: {
    winner: string;
    confidence: number;
    difference: number;
    interpretation: string;
    spread?: number;
  };
  period: string;
  timestamp: string;
};

// NOTE: 현재 페이지에서 사용되지 않지만, 빠른 실험/복구를 위해 남겨둔다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LiveChartSection() {
  const [chartMode, setChartMode] = useState<'price' | 'strength'>('price');

  return (
    <Card className="border border-slate-800/80 rounded-2xl bg-slate-950/80 p-4 shadow-lg shadow-black/40">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          실시간 차트
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setChartMode('price')}
            className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
              chartMode === 'price'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'bg-slate-900/70 text-slate-500 hover:text-slate-300'
            }`}
          >
            가격
          </button>
          <button
            onClick={() => setChartMode('strength')}
            className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
              chartMode === 'strength'
                ? 'bg-purple-500/20 text-purple-300'
                : 'bg-slate-900/70 text-slate-500 hover:text-slate-300'
            }`}
          >
            강도
          </button>
        </div>
      </div>

      {chartMode === 'price' ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-900/50 p-2">
            <div className="mb-1 text-[10px] text-yellow-400 font-semibold">GOLD (PAXG)</div>
            <PAXGPriceChart height={100} period="1h" theme="dark" />
          </div>
          <div className="rounded-lg bg-slate-900/50 p-2">
            <div className="mb-1 text-[10px] text-orange-400 font-semibold">BTC</div>
            <BTCPriceChart height={100} period="1h" theme="dark" />
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-slate-900/50 p-2">
          <SpreadCandlestickChart
            height={200}
            period="1h"
            refreshInterval={5000}
            maxDataPoints={30}
          />
        </div>
      )}
    </Card>
  );
}

// 메인 트레이드 대시보드 (Basevol 스타일 레이아웃 레퍼런스)
export default function HomePage() {
  const [isConnected, setIsConnected] = useState(false);
  // NOTE: 세션 복원/지갑 연결 시 주소를 저장하지만, 현재 UI에서는 표시하지 않는다.
  const [, setWalletAddress] = useState('');
  const [points, setPoints] = useState(0);
  const [timeframe] = useState<'3M' | '1M' | '6H' | '1D'>('3M');
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [loadingRound, setLoadingRound] = useState(false);
  const [isBettingModalOpen, setIsBettingModalOpen] = useState(false);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [historicalPaxg, setHistoricalPaxg] = useState<HistoricalDataPoint[]>([]);
  const [historicalBtc, setHistoricalBtc] = useState<HistoricalDataPoint[]>([]);
  const [activeChart, setActiveChart] = useState<'strength' | 'volatility' | 'price'>('strength');

  const { currentWallet } = useCurrentWallet();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const wallets = useWallets();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { toast } = useToast();

  // 자동 차트 데이터 수집 (5초마다)
  const { status: collectStatus } = useAutoCollect(5000);

  // 차트 데이터 메모이제이션 (불필요한 리렌더링 방지)
  const priceChartData = useMemo(() => {
    if (historicalPaxg.length === 0 || historicalBtc.length === 0) return [];
    return historicalPaxg.map((paxgPoint, index) => {
      const btcPoint = historicalBtc[index];
      return {
        timestamp: paxgPoint.timestamp,
        paxg: paxgPoint.close,
        btc: btcPoint ? btcPoint.close : 0,
      };
    });
  }, [historicalPaxg, historicalBtc]);

  // 변동성 차트 데이터 메모이제이션
  const volatilityChartData = useMemo(() => {
    if (!comparisonData) return null;
    return {
      asset1: comparisonData.asset1,
      asset2: comparisonData.asset2,
    };
  }, [comparisonData]);

  // 페이지 로드 시 쿠키에서 주소 읽어서 상태 복원
  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.user) {
          setIsConnected(true);
          setWalletAddress(data.data.user.suiAddress);
          setPoints(data.data.user.delBalance || 0);
        }
      })
      .catch(() => {
        // 에러 무시 (로그인 안 된 상태일 수 있음)
      });
  }, []);

  // currentWallet 상태 동기화
  useEffect(() => {
    if (currentWallet?.accounts[0]?.address) {
      const address = currentWallet.accounts[0].address;
      setIsConnected(true);
      setWalletAddress(address);
    } else if (!currentWallet) {
      setIsConnected(false);
      setWalletAddress('');
    }
  }, [currentWallet]);

  // 현재 라운드 로드
  const loadCurrentRound = async () => {
    setLoadingRound(true);
    try {
      const roundType =
        timeframe === '3M'
          ? 'DEMO_3MIN'
          : timeframe === '1M'
            ? '1MIN'
            : timeframe === '6H'
              ? '6HOUR'
              : '1DAY';
      const response = await fetch(`/api/rounds/current?type=${roundType}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success && data.data) {
        setCurrentRound(data.data);
      } else {
        setCurrentRound(null);
      }
    } catch (error) {
      console.error('라운드 로드 실패:', error);
      setCurrentRound(null);
    } finally {
      setLoadingRound(false);
    }
  };

  // 차트 데이터 로드 (useCallback으로 메모이제이션하여 불필요한 리렌더링 방지)
  const loadChartData = useCallback(async () => {
    try {
      const [comparisonRes, paxgRes, btcRes] = await Promise.all([
        fetch('/api/chart/compare?asset1=PAXG&asset2=BTC&period=24h'),
        fetch('/api/chart/historical?asset=PAXG&period=24h'),
        fetch('/api/chart/historical?asset=BTC&period=24h'),
      ]);

      const comparisonResult = await comparisonRes.json();
      const paxgResult = await paxgRes.json();
      const btcResult = await btcRes.json();

      // 데이터가 변경된 경우에만 상태 업데이트 (불필요한 리렌더링 방지)
      if (comparisonResult.success) {
        setComparisonData((prev: ComparisonData | null) => {
          // 데이터가 실제로 변경되었는지 확인
          if (prev && JSON.stringify(prev) === JSON.stringify(comparisonResult.data)) {
            return prev; // 동일하면 이전 값 반환
          }
          return comparisonResult.data as ComparisonData;
        });
      } else {
        console.warn('비교 데이터 로드 실패:', comparisonResult.error);
      }

      if (paxgResult.success) {
        setHistoricalPaxg((prev) => {
          const newData = paxgResult.data.data || [];
          // 배열이 동일한지 확인 (간단한 길이와 마지막 값 비교)
          if (prev.length === newData.length && prev.length > 0) {
            const prevLast = prev[prev.length - 1];
            const newLast = newData[newData.length - 1];
            if (prevLast?.timestamp === newLast?.timestamp && prevLast?.close === newLast?.close) {
              return prev; // 동일하면 이전 값 반환
            }
          }
          return newData;
        });
      } else {
        console.warn('PAXG 데이터 로드 실패:', paxgResult.error);
      }

      if (btcResult.success) {
        setHistoricalBtc((prev) => {
          const newData = btcResult.data.data || [];
          // 배열이 동일한지 확인
          if (prev.length === newData.length && prev.length > 0) {
            const prevLast = prev[prev.length - 1];
            const newLast = newData[newData.length - 1];
            if (prevLast?.timestamp === newLast?.timestamp && prevLast?.close === newLast?.close) {
              return prev; // 동일하면 이전 값 반환
            }
          }
          return newData;
        });
      } else {
        console.warn('BTC 데이터 로드 실패:', btcResult.error);
      }
    } catch (error) {
      console.error('차트 데이터 로드 실패:', error);
    }
  }, []); // 의존성 배열을 비워서 함수가 재생성되지 않도록 함

  // NOTE: MARKET(comparisonData)와 차트는 loadChartData()를 실제로 호출해야 채워진다.
  // 기존에는 버튼 클릭 시에만 loadChartData()가 실행되어 "로딩 중..."이 계속 뜰 수 있었다.
  useEffect(() => {
    loadChartData();
    const interval = setInterval(loadChartData, 10_000);
    return () => clearInterval(interval);
  }, [loadChartData]);

  // 타임프레임 변경 시 라운드 새로 로드
  useEffect(() => {
    loadCurrentRound();
    // 10초마다 라운드 정보 갱신
    const interval = setInterval(loadCurrentRound, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  // 베팅 모달 열기 (테스트용 - 검증 우회)
  const handleOpenBettingModal = () => {
    // 테스트: 바로 모달 열기
    setIsBettingModalOpen(true);

    // 원래 검증 로직 (테스트 후 복원 필요)
    // if (!isConnected) {
    //   toast({
    //     title: '지갑 연결 필요',
    //     description: '베팅하려면 먼저 지갑을 연결해주세요.',
    //     variant: 'destructive',
    //   });
    //   return;
    // }

    // if (!currentRound) {
    //   toast({
    //     title: '라운드 없음',
    //     description: '현재 진행 중인 라운드가 없습니다.',
    //     variant: 'destructive',
    //   });
    //   return;
    // }

    // if (currentRound.status !== 'BETTING_OPEN') {
    //   toast({
    //     title: '베팅 불가',
    //     description: '현재 베팅할 수 없는 상태입니다.',
    //     variant: 'destructive',
    //   });
    //   return;
    // }
  };

  const isUserRejectionError = (error: unknown) => {
    if (!error) return false;
    if (error instanceof Error && /user rejected/i.test(error.message)) return true;
    const code = (error as { code?: string | number }).code;
    return code === 4001 || code === 'USER_REJECTED' || code === 'USER_REJECTED_REQUEST';
  };

  const buildLoginMessage = (nonce: string, expMs: number) => {
    const domain = typeof window !== 'undefined' ? window.location.host : 'deltax.app';
    return `DeltaX Login
Domain: ${domain}
Nonce: ${nonce}
Exp: ${expMs}`;
  };

  const requestSession = async (address: string) => {
    const nonce = crypto.randomUUID();
    const expMs = Date.now() + 5 * 60_000; // 5분 유효
    const message = buildLoginMessage(nonce, expMs);

    const encoder = new TextEncoder();
    let signature: string;
    let signedMessageBytes: string;

    try {
      const signed = await signPersonalMessage({
        message: encoder.encode(message),
      });

      signature = signed.signature;
      // signed.bytes는 SDK 버전에 따라 string(base64) 또는 Uint8Array일 수 있음
      const rawBytes = signed.bytes as string | Uint8Array;
      if (typeof rawBytes === 'string') {
        signedMessageBytes = rawBytes;
      } else {
        // Uint8Array → base64 (Array.from 사용하여 iterator 문제 회피)
        signedMessageBytes = btoa(String.fromCharCode.apply(null, Array.from(rawBytes)));
      }
    } catch (error) {
      if (isUserRejectionError(error)) {
        console.info('사용자가 메시지 서명을 취소했습니다.');
        return;
      }
      throw error;
    }

    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ suiAddress: address, signature, message, signedMessageBytes }),
    });

    const safeParseJson = async (res: Response) => {
      try {
        return await res.clone().json();
      } catch {
        const text = await res.text();
        return { error: { message: text || '응답 파싱 실패' } };
      }
    };

    const parsed = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(parsed.error?.message || '로그인에 실패했습니다.');
    }

    if (!parsed.success) {
      throw new Error(parsed.error?.message || '로그인에 실패했습니다.');
    }

    setIsConnected(true);
    setWalletAddress(address);

    // 로그인 성공 시 포인트 업데이트
    if (parsed.data?.user) {
      setPoints(parsed.data.user.delBalance || 0);
    }
  };

  const handleConnect = async () => {
    // 사용 가능한 지갑이 없으면 에러 처리
    if (wallets.length === 0) {
      alert('사용 가능한 지갑이 없습니다. Sui 지갑 확장 프로그램을 설치해주세요.');
      return;
    }

    try {
      // 첫 번째 사용 가능한 지갑 사용 (Dapp Kit에 활성화 등록)
      const wallet = wallets[0];
      const result = await connectWallet({ wallet });

      const account = result?.accounts?.[0] ?? currentWallet?.accounts?.[0] ?? wallet.accounts?.[0];

      if (!account) {
        throw new Error('지갑 연결 결과에 계정이 없습니다.');
      }

      await requestSession(account.address);
    } catch (error) {
      if (isUserRejectionError(error)) {
        console.info('사용자가 지갑 요청을 취소했습니다.');
        return;
      }

      console.error('지갑 연결 중 오류:', error);
      const message = error instanceof Error ? error.message : '지갑 연결 중 오류가 발생했습니다.';
      alert(message);
    }
  };

  const handleDisconnect = async () => {
    // 로그아웃 API 호출
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // 에러 무시
    });

    // 지갑 연결 해제
    if (currentWallet) {
      // 지갑의 disconnect 기능을 직접 호출
      if (currentWallet.features && currentWallet.features['standard:disconnect']) {
        const disconnectFeature = currentWallet.features['standard:disconnect'];
        await disconnectFeature.disconnect();
      } else {
        // fallback: useDisconnectWallet 사용
        disconnectWallet();
      }
    } else {
      // useDisconnectWallet 사용
      disconnectWallet();
    }

    setIsConnected(false);
    setWalletAddress('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* 배경 그라디언트 */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-80 h-80 bg-pink-500/15 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.1),transparent_70%)]" />
      </div>

      {/* 상단 헤더 */}
      <header className="sticky top-0 z-50 border-b border-cyan-500/30 backdrop-blur-xl bg-white/90 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* 로고 + 타이틀 */}
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 flex-shrink-0">
                <Image src="/logo.png" alt="DeltaX Logo" fill className="object-contain" priority />
              </div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 bg-clip-text text-transparent drop-shadow-lg">
                DELTA X
              </h1>
            </div>

            {/* 헤더 오른쪽: 포인트 + CARRY 버튼 */}
            <div className="flex items-center gap-4">
              {isConnected && (
                <Card className="px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/40 backdrop-blur-sm hover:border-cyan-500/60 transition-all duration-300 shadow-lg shadow-cyan-500/30 bg-white/80">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-cyan-600 animate-pulse" />
                    <span className="font-mono font-bold text-cyan-700">
                      {points.toLocaleString()}
                    </span>
                    <span className="text-sm text-cyan-600/70">DEL</span>
                  </div>
                </Card>
              )}

              {isConnected ? (
                <Button
                  onClick={handleDisconnect}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-lg hover:shadow-purple-500/50 transition-all duration-300 text-white font-bold shadow-md"
                >
                  CARRY
                </Button>
              ) : (
                <Button
                  onClick={handleConnect}
                  className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 text-white font-bold shadow-md"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 중앙-왼쪽: LIVE ROUND */}
          <section className="lg:col-span-2 flex flex-col gap-6">
            {/* LIVE ROUND 카드 */}
            <Card className="border border-cyan-500/30 bg-white/90 backdrop-blur-sm p-6 shadow-lg shadow-cyan-500/20 hover:border-cyan-500/50 transition-all duration-300">
              <div className="mb-6">
                <h2 className="text-3xl md:text-4xl font-black mb-2 bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
                  <Activity className="h-8 w-8 text-cyan-600" />
                  LIVE ROUND
                </h2>
                <div className="w-24 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full shadow-lg shadow-cyan-500/50" />
              </div>

              {/* 현재 라운드 정보 */}
              {currentRound && (
                <div className="mb-6 rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/40 p-4 shadow-md">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-lg font-bold text-cyan-700 font-mono">
                      ROUND #{currentRound.roundNumber} (
                      {timeframe === '3M'
                        ? 'DEMO_3MIN'
                        : timeframe === '1M'
                          ? '1MIN'
                          : timeframe === '6H'
                            ? '6HOUR'
                            : '1DAY'}
                      )
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        currentRound.status === 'BETTING_OPEN'
                          ? 'bg-emerald-500/30 text-emerald-700 border border-emerald-500/50'
                          : currentRound.status === 'BETTING_LOCKED'
                            ? 'bg-yellow-500/30 text-yellow-700 border border-yellow-500/50'
                            : 'bg-slate-300/50 text-slate-600'
                      }`}
                    >
                      {currentRound.status === 'BETTING_OPEN'
                        ? '🟢 OPEN'
                        : currentRound.status === 'BETTING_LOCKED'
                          ? '🔒 LOCKED'
                          : currentRound.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="rounded-lg bg-white/80 border border-cyan-500/30 px-4 py-3 shadow-sm">
                      <span className="text-xs text-cyan-600 font-semibold">TOTAL POOL</span>
                      <div className="mt-1 text-2xl font-black text-cyan-700 font-mono">
                        {currentRound.totalPool.toLocaleString()}
                      </div>
                      <span className="text-xs text-cyan-600/70">DEL</span>
                    </div>
                    <div className="rounded-lg bg-white/80 border border-purple-500/30 px-4 py-3 shadow-sm">
                      <span className="text-xs text-purple-600 font-semibold">PLAYERS</span>
                      <div className="mt-1 text-2xl font-black text-purple-700">
                        {currentRound.totalBetsCount}
                      </div>
                      <span className="text-xs text-purple-600/70">Active</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg bg-white/80 border border-yellow-500/30 px-4 py-3 shadow-sm">
                      <span className="text-xs text-yellow-600 font-semibold">GOLD BETS</span>
                      <div className="mt-1 text-xl font-black text-yellow-700 font-mono">
                        {currentRound.totalGoldBets?.toLocaleString() || 0}
                      </div>
                      <span className="text-xs text-yellow-600/70">
                        {currentRound.totalPool > 0
                          ? `${(((currentRound.totalGoldBets || 0) / currentRound.totalPool) * 100).toFixed(0)}%`
                          : '0%'}
                      </span>
                    </div>
                    <div className="rounded-lg bg-white/80 border border-orange-500/30 px-4 py-3 shadow-sm">
                      <span className="text-xs text-orange-600 font-semibold">BTC BETS</span>
                      <div className="mt-1 text-xl font-black text-orange-700 font-mono">
                        {currentRound.totalBtcBets?.toLocaleString() || 0}
                      </div>
                      <span className="text-xs text-orange-600/70">
                        {currentRound.totalPool > 0
                          ? `${(((currentRound.totalBtcBets || 0) / currentRound.totalPool) * 100).toFixed(0)}%`
                          : '0%'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 차트 섹션 */}
              <div className="mt-6">
                {/* 차트 전환 버튼 */}
                <div className="mb-4 flex gap-2">
                  <Button
                    onClick={() => setActiveChart('strength')}
                    className={`flex-1 transition-all duration-300 ${
                      activeChart === 'strength'
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50'
                        : 'border border-purple-500/40 bg-white/80 text-purple-600/70 hover:bg-purple-500/10 hover:border-purple-500/60'
                    }`}
                  >
                    STRENGTH SPREAD
                  </Button>
                  <Button
                    onClick={() => setActiveChart('volatility')}
                    className={`flex-1 transition-all duration-300 ${
                      activeChart === 'volatility'
                        ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white shadow-lg shadow-cyan-500/50'
                        : 'border border-cyan-500/40 bg-white/80 text-cyan-600/70 hover:bg-cyan-500/10 hover:border-cyan-500/60'
                    }`}
                  >
                    <Activity className="mr-2 h-4 w-4" />
                    VOLATILITY ANALYSIS
                  </Button>
                  <Button
                    onClick={() => setActiveChart('price')}
                    className={`flex-1 transition-all duration-300 ${
                      activeChart === 'price'
                        ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white shadow-lg shadow-cyan-500/50'
                        : 'border border-cyan-500/40 bg-white/80 text-cyan-600/70 hover:bg-cyan-500/10 hover:border-cyan-500/60'
                    }`}
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    PRICE TREND
                  </Button>
                </div>

                {/* 차트 내용 */}
                {activeChart === 'strength' ? (
                  <div>
                    <SpreadCandlestickChart
                      height={300}
                      period="1h"
                      refreshInterval={5000}
                      maxDataPoints={50}
                    />
                    {comparisonData && false && (
                      <div className="mt-6 space-y-4">
                        <div className="rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/40 p-4 shadow-md bg-white/80">
                          <div className="text-center">
                            <p className="text-xs text-purple-600 font-semibold mb-2">
                              현재 우세 (Current Dominance)
                            </p>
                            <p className="text-2xl font-black text-purple-700 mb-1">
                              {comparisonData?.comparison?.winner || 'PAXG'}
                            </p>
                            <p className="text-sm text-purple-600/70">영봉 (Bearish candle)</p>
                          </div>
                        </div>
                        <div className="rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/40 p-4 shadow-md bg-white/80">
                          <div className="text-center">
                            <p className="text-xs text-cyan-600 font-semibold mb-2">
                              격차 (Spread)
                            </p>
                            <p className="text-2xl font-black text-cyan-700 mb-1">
                              {comparisonData?.comparison?.spread?.toFixed(2) || '78.63'}
                            </p>
                            <p className="text-sm text-cyan-600/70">큰 격차 (Large spread)</p>
                          </div>
                        </div>
                        <div className="rounded-xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/40 p-4 shadow-md bg-white/80">
                          <div className="text-center">
                            <p className="text-xs text-yellow-600 font-semibold mb-2">
                              PAXG 승률 (PAXG Win Rate)
                            </p>
                            <p className="text-2xl font-black text-yellow-700 mb-1">100%</p>
                            <p className="text-sm text-yellow-600/70">
                              최근 50개 데이터 (Recent 50 data)
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : activeChart === 'volatility' ? (
                  comparisonData && comparisonData.asset1 && comparisonData.asset2 ? (
                    <div>
                      <VolatilityComparisonChart
                        data={
                          volatilityChartData || {
                            asset1: comparisonData.asset1,
                            asset2: comparisonData.asset2,
                          }
                        }
                      />
                      {comparisonData?.comparison && (
                        <div className="mt-6 rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/40 p-4 shadow-md bg-white/80">
                          <div className="text-center">
                            <p className="text-xs text-cyan-600 font-semibold mb-2">WINNER</p>
                            <p className="text-2xl font-black text-cyan-700 mb-1">
                              {comparisonData.comparison.winner}
                            </p>
                            <p className="text-sm text-cyan-600/70">
                              Confidence: {(comparisonData.comparison.confidence * 100).toFixed(0)}%
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <VolatilityComparisonChart
                        data={{
                          asset1: { name: 'PAXG', volatility: 0, return: 0, adjustedReturn: 0 },
                          asset2: { name: 'BTC', volatility: 0, return: 0, adjustedReturn: 0 },
                        }}
                      />
                    </div>
                  )
                ) : activeChart === 'price' ? (
                  priceChartData.length > 0 ? (
                    <div>
                      <PriceTrendChart data={priceChartData} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 gap-3">
                      <div className="text-cyan-600">가격 차트 데이터 로딩 중...</div>
                      <div className="text-xs text-cyan-600/50">
                        {collectStatus.isRunning
                          ? `자동 수집 중... (${collectStatus.collectCount}회 수집됨)`
                          : '자동 수집 대기 중...'}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="rounded-xl bg-white/80 border border-cyan-500/30 p-4 shadow-md">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-cyan-700/70 text-center">
                        {activeChart === 'volatility'
                          ? '변동성 분석 데이터를 불러올 수 없습니다.'
                          : '차트 데이터를 불러올 수 없습니다. 데이터 수집이 필요할 수 있습니다.'}
                      </p>
                      <div className="text-xs text-cyan-600/50">
                        {collectStatus.isRunning
                          ? `자동 수집 중... (${collectStatus.collectCount}회 수집됨)`
                          : '자동 수집 대기 중...'}
                      </div>
                      <Button
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/chart/collect', { method: 'POST' });
                            const result = await response.json();
                            if (result.success) {
                              toast({
                                title: '데이터 수집 성공',
                                description:
                                  '차트 데이터를 수집했습니다. 잠시 후 차트가 표시됩니다.',
                              });
                              // 수집 후 데이터 다시 로드
                              setTimeout(() => {
                                loadChartData();
                              }, 1000);
                            } else {
                              toast({
                                title: '데이터 수집 실패',
                                description: result.error?.message || '데이터 수집에 실패했습니다.',
                                variant: 'destructive',
                              });
                            }
                          } catch {
                            toast({
                              title: '데이터 수집 실패',
                              description: '데이터 수집 중 오류가 발생했습니다.',
                              variant: 'destructive',
                            });
                          }
                        }}
                        className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 text-white font-bold shadow-md"
                      >
                        데이터 수집하기
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* 랭킹 보드 */}
            <Card className="border border-cyan-500/30 bg-white/90 backdrop-blur-sm p-6 shadow-lg shadow-cyan-500/20 hover:border-cyan-500/50 transition-all duration-300">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-cyan-700 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-cyan-600" />
                    Leaderboard 🏆
                  </h2>
                  <p className="text-xs text-cyan-600/70 mt-1">
                    DEL 보유량 + NFT/뱃지 등 Achievements의 총자산 기준 상위 유저입니다.
                  </p>
                </div>
                <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-xs text-cyan-700 font-semibold">
                  데모 랭킹
                </span>
              </div>

              <RankingList />
            </Card>
          </section>

          {/* 우측: QUICK ACTIONS + MARKET */}
          <section className="flex flex-col gap-6">
            {/* QUICK ACTIONS */}
            <Card className="border border-cyan-500/30 bg-white/90 backdrop-blur-sm p-6 shadow-lg shadow-cyan-500/20 hover:border-cyan-500/50 transition-all duration-300">
              <h3 className="mb-4 text-xl font-black text-cyan-700 flex items-center gap-2">
                <Zap className="h-5 w-5 text-cyan-600 animate-pulse" />
                QUICK ACTIONS
              </h3>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleOpenBettingModal}
                  // NOTE: 베팅이 마감/정산/종료 상태여도 모달은 열려야 클레임/상태 확인이 가능하다.
                  disabled={loadingRound || !currentRound}
                  className="w-full justify-between rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-sm font-bold text-white shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transition-all duration-300 py-6"
                >
                  🎯 PLACE BET
                  <ArrowRight className="h-5 w-5" />
                </Button>
                <Button
                  asChild
                  className="w-full justify-between rounded-lg border border-pink-500/50 bg-transparent text-sm font-bold text-pink-300 hover:bg-pink-500/10 hover:border-pink-400 transition-all duration-300 py-6"
                >
                  <a href="/shop">
                    🛍️ NFT SHOP
                    <Calendar className="h-5 w-5" />
                  </a>
                </Button>
              </div>
            </Card>

            {/* MARKET */}
            <Card className="border border-cyan-500/30 bg-white/90 backdrop-blur-sm p-6 shadow-lg shadow-cyan-500/20 hover:border-cyan-500/50 transition-all duration-300">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-cyan-600" />
                <h3 className="text-xl font-black text-cyan-700">MARKET</h3>
              </div>
              <div className="space-y-3">
                {/* GOLD */}
                {comparisonData?.asset1 ? (
                  <div className="flex items-center justify-between rounded-lg bg-white/80 border border-emerald-500/30 px-4 py-3 shadow-sm">
                    <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      GOLD
                    </span>
                    <span className="font-mono text-lg font-bold text-emerald-700">
                      {comparisonData.asset1.return >= 0 ? '+' : ''}
                      {comparisonData.asset1.return.toFixed(2)}%
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg bg-white/80 border border-emerald-500/30 px-4 py-3 shadow-sm">
                    <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      GOLD
                    </span>
                    <span className="font-mono text-sm text-emerald-600/50">로딩 중...</span>
                  </div>
                )}

                {/* BTC */}
                {comparisonData?.asset2 ? (
                  <div className="flex items-center justify-between rounded-lg bg-white/80 border border-red-500/30 px-4 py-3 shadow-sm">
                    <span className="flex items-center gap-2 text-sm font-semibold text-red-600">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      BTC
                    </span>
                    <span className="font-mono text-lg font-bold text-red-700">
                      {comparisonData.asset2.return >= 0 ? '+' : ''}
                      {comparisonData.asset2.return.toFixed(2)}%
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg bg-white/80 border border-red-500/30 px-4 py-3 shadow-sm">
                    <span className="flex items-center gap-2 text-sm font-semibold text-red-600">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      BTC
                    </span>
                    <span className="font-mono text-sm text-red-600/50">로딩 중...</span>
                  </div>
                )}

                {/* POOL SIZE */}
                <div className="flex items-center justify-between rounded-lg bg-white/80 border border-cyan-500/30 px-4 py-3 shadow-sm">
                  <span className="text-sm font-semibold text-cyan-600">POOL SIZE</span>
                  <span className="font-mono text-lg font-bold text-cyan-700">
                    {currentRound
                      ? currentRound.totalPool >= 1000000
                        ? `${(currentRound.totalPool / 1000000).toFixed(1)}M`
                        : currentRound.totalPool >= 1000
                          ? `${(currentRound.totalPool / 1000).toFixed(1)}K`
                          : currentRound.totalPool.toLocaleString()
                      : '0'}
                  </span>
                </div>

                {/* SUISCAN LINKS (Round on-chain references) */}
                {currentRound &&
                  (currentRound.suiPoolAddress ||
                    currentRound.suiSettlementObjectId ||
                    currentRound.suiCreatePoolTxDigest ||
                    currentRound.suiLockPoolTxDigest ||
                    currentRound.suiFinalizeTxDigest) && (
                    <div className="rounded-lg bg-white/80 border border-cyan-500/20 px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-cyan-600">SUISCAN</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {currentRound.suiPoolAddress && (
                            <a
                              href={getSuiscanObjectUrl(currentRound.suiPoolAddress)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-700 underline hover:text-cyan-800"
                            >
                              Pool
                            </a>
                          )}
                          {currentRound.suiSettlementObjectId && (
                            <a
                              href={getSuiscanObjectUrl(currentRound.suiSettlementObjectId)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-700 underline hover:text-cyan-800"
                            >
                              Settlement
                            </a>
                          )}
                          {currentRound.suiCreatePoolTxDigest && (
                            <a
                              href={getSuiscanTxUrl(currentRound.suiCreatePoolTxDigest)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-700 underline hover:text-cyan-800"
                            >
                              CreateTx
                            </a>
                          )}
                          {currentRound.suiLockPoolTxDigest && (
                            <a
                              href={getSuiscanTxUrl(currentRound.suiLockPoolTxDigest)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-700 underline hover:text-cyan-800"
                            >
                              LockTx
                            </a>
                          )}
                          {currentRound.suiFinalizeTxDigest && (
                            <a
                              href={getSuiscanTxUrl(currentRound.suiFinalizeTxDigest)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-700 underline hover:text-cyan-800"
                            >
                              FinalizeTx
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </Card>
          </section>
        </div>
      </div>

      {/* 베팅 모달 */}
      <BettingModal
        isOpen={isBettingModalOpen}
        onClose={() => setIsBettingModalOpen(false)}
        roundType={
          timeframe === '3M'
            ? 'DEMO_3MIN'
            : timeframe === '1M'
              ? '1MIN'
              : timeframe === '6H'
                ? '6HOUR'
                : '1DAY'
        }
      />
    </div>
  );
}
