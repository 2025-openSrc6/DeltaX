'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LogOut, ArrowRight, Sparkles, BarChart3, Wallet, Zap, Activity } from 'lucide-react';

import { RankingList } from '@/components/RankingList';
import { PointsPanel } from '@/components/PointsPanel';
import { DashboardMiniChart } from '@/components/DashboardMiniChart';
import { BettingModal } from '@/components/bets/BettingModal';
import { PAXGPriceChart, BTCPriceChart } from '@/components/charts';
import SpreadCandlestickChart from '@/components/charts/SpreadCandlestickChart';
import {
  useCurrentWallet,
  useConnectWallet,
  useWallets,
  useDisconnectWallet,
  useSignPersonalMessage,
} from '@mysten/dapp-kit';
import { useToast } from '@/hooks/use-toast';
import type { Round } from '@/db/schema/rounds';

// 실시간 관전 차트 섹션
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
  const [walletAddress, setWalletAddress] = useState('');
  const [points, setPoints] = useState(0);
  const [timeframe, setTimeframe] = useState<'3M' | '1M' | '6H' | '1D'>('3M');
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [loadingRound, setLoadingRound] = useState(false);
  const [isBettingModalOpen, setIsBettingModalOpen] = useState(false);

  const { currentWallet } = useCurrentWallet();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const wallets = useWallets();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { toast } = useToast();

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

  // 타임프레임 변경 시 라운드 새로 로드
  useEffect(() => {
    loadCurrentRound();
    // 10초마다 라운드 정보 갱신
    const interval = setInterval(loadCurrentRound, 10000);
    return () => clearInterval(interval);
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

  // 베팅 성공 핸들러
  const handleBetSuccess = async () => {
    toast({
      title: '베팅 성공! 🎉',
      description: '베팅이 성공적으로 등록되었습니다.',
    });
    loadCurrentRound(); // 라운드 정보 갱신

    // 포인트 업데이트 (베팅 후 잔액 반영)
    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await response.json();
      if (data.success && data.data?.user) {
        setPoints(data.data.user.delBalance || 0);
      }
    } catch (error) {
      console.error('포인트 업데이트 실패:', error);
    }
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

  const displayAddress =
    walletAddress.length > 10
      ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
      : walletAddress;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* 배경 그라디언트 */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-80 h-80 bg-pink-500/5 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.06),transparent_70%)]" />
      </div>

      {/* 상단 헤더 */}
      <header className="sticky top-0 z-50 border-b border-cyan-500/20 backdrop-blur-xl bg-slate-950/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* 로고 + 타이틀 */}
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 flex-shrink-0">
                <Image src="/logo.png" alt="DeltaX Logo" fill className="object-contain" priority />
              </div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-lg">
                DELTA X
              </h1>
            </div>

            {/* 헤더 오른쪽: 포인트 + 연결 상태 */}
            <div className="flex items-center gap-4">
              {isConnected && (
                <Card className="px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/50 backdrop-blur-sm hover:border-cyan-400/80 transition-all duration-300 shadow-lg shadow-cyan-500/20">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-cyan-400 animate-pulse" />
                    <span className="font-mono font-bold text-cyan-300">
                      {points.toLocaleString()}
                    </span>
                    <span className="text-sm text-cyan-200/60">DEL</span>
                  </div>
                </Card>
              )}

              {isConnected ? (
                <Button
                  onClick={handleDisconnect}
                  className="border border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-500/10 bg-transparent text-cyan-300 transition-all duration-300"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  {displayAddress}
                </Button>
              ) : (
                <Button
                  onClick={handleConnect}
                  className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 text-white font-bold"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 메인 그리드: 좌측 마켓 / 중앙 차트 / 우측 내 정보 */}
      <div className="container mx-auto px-4 py-8">
        <div className="mt-3 grid flex-1 gap-4 rounded-[24px] bg-slate-950/60 p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)_minmax(0,1.3fr)] lg:p-4">
          {/* 중앙: 차트 & 라운드 요약 (Basevol 메인 영역 느낌) */}
          <section className="flex flex-col gap-4 lg:col-span-2">
            {/* 상단: 라운드/타임프레임 헤더 */}
            <Card className="border border-slate-800/80 rounded-2xl bg-slate-950/80 p-4 shadow-xl shadow-black/40">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                    <Sparkles className="h-3 w-3 text-cyan-400" /> 실시간 라운드 현황
                  </div>
                  <h1 className="mt-2 text-lg font-semibold text-slate-50 lg:text-xl">
                    {timeframe === '3M' && '3 MIN 라운드 변동성 차트'}
                    {timeframe === '1D' && '1 DAY 라운드 변동성 차트'}
                    {timeframe === '6H' && '6 HOUR 라운드 변동성 차트'}
                    {timeframe === '1M' && '1 MIN 라운드 스캘핑 차트'}
                  </h1>
                </div>
              </div>

              {/* 현재 라운드 정보 */}
              {currentRound && (
                <div className="mb-4 rounded-lg bg-slate-900/70 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">
                      라운드 #{currentRound.roundNumber}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        currentRound.status === 'BETTING_OPEN'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : currentRound.status === 'BETTING_LOCKED'
                            ? 'bg-yellow-500/20 text-yellow-300'
                            : 'bg-slate-700/50 text-slate-400'
                      }`}
                    >
                      {currentRound.status === 'BETTING_OPEN'
                        ? '베팅 가능'
                        : currentRound.status === 'BETTING_LOCKED'
                          ? '베팅 마감'
                          : currentRound.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-slate-800/50 px-2 py-1.5">
                      <span className="text-slate-500">총 풀</span>
                      <div className="mt-0.5 font-mono font-semibold text-cyan-300">
                        {currentRound.totalPool.toLocaleString()} DEL
                      </div>
                    </div>
                    <div className="rounded bg-slate-800/50 px-2 py-1.5">
                      <span className="text-slate-500">참여자</span>
                      <div className="mt-0.5 font-semibold text-slate-200">
                        {currentRound.totalBetsCount}명
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <DashboardMiniChart />
            </Card>

            {/* 하단: 랭킹 보드 */}
            <Card className="border border-slate-800/80 rounded-2xl bg-slate-950/80 p-4 shadow-xl shadow-black/40">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Leaderboard 🏆</h2>
                  <p className="text-[11px] text-slate-500">
                    DEL 보유량 + NFT/뱃지 등 Achievements의 총자산 기준 상위 유저입니다.
                  </p>
                </div>
                <span className="rounded-full bg-slate-900/80 px-2 py-1 text-[10px] text-slate-400">
                  데모 랭킹
                </span>
              </div>

              <RankingList />
            </Card>
          </section>

          {/* 우측: 내 계정 / 포인트 / 퀵 액션 */}
          <section className="flex flex-col gap-4">
            <PointsPanel points={points} />

            <Card className="border border-slate-800/80 rounded-2xl bg-slate-950/80 p-4 shadow-lg shadow-black/40">
              <h3 className="mb-3 border-b border-slate-800 pb-2 text-sm font-semibold text-slate-200">
                Quick Actions ⚡
              </h3>
              <div className="flex flex-col gap-2.5">
                <Button
                  onClick={handleOpenBettingModal}
                  disabled={loadingRound || !currentRound || currentRound.status !== 'BETTING_OPEN'}
                  className="w-full justify-between rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-xs font-semibold text-slate-950 shadow-md shadow-cyan-500/30 hover:from-cyan-400 hover:to-emerald-400 hover:shadow-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingRound
                    ? '로딩 중...'
                    : !currentRound
                      ? '라운드 없음'
                      : currentRound.status !== 'BETTING_OPEN'
                        ? '베팅 마감'
                        : '베팅하기'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="w-full justify-between rounded-xl border-purple-500/40 bg-slate-950/60 text-xs font-semibold text-purple-200 hover:bg-slate-900/80"
                >
                  <a href="/shop">
                    {' '}
                    {/* a 태그로 감싸 /shop 이동 */}
                    NFT 상점 보기
                    <Wallet className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-between rounded-xl border-slate-700 bg-slate-950/60 text-[11px] font-medium text-slate-200 hover:bg-slate-900/80"
                >
                  지난 라운드 히스토리
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </Card>

            {/* 실시간 관전 차트 */}
            <LiveChartSection />
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
