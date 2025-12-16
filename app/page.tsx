'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, ArrowRight, Sparkles, BarChart3, Wallet } from 'lucide-react';

import { RankingList } from '@/components/RankingList';
import { PointsPanel } from '@/components/PointsPanel';
import { DashboardMiniChart } from '@/components/DashboardMiniChart';
import { BettingModal } from '@/components/BettingModal';
import {
  useCurrentWallet,
  useConnectWallet,
  useWallets,
  useDisconnectWallet,
  useSignPersonalMessage,
} from '@mysten/dapp-kit';
import { useToast } from '@/hooks/use-toast';
import type { Round } from '@/db/schema/rounds';

// 메인 트레이드 대시보드 (Basevol 스타일 레이아웃 레퍼런스)
export default function HomePage() {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [points, setPoints] = useState(12000);
  const [timeframe, setTimeframe] = useState<'1M' | '6H' | '1D'>('1D');
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
      const roundType = timeframe === '1M' ? '1MIN' : timeframe === '6H' ? '6HOUR' : '1DAY';
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

  // 베팅 모달 열기
  const handleOpenBettingModal = () => {
    if (!isConnected) {
      toast({
        title: '지갑 연결 필요',
        description: '베팅하려면 먼저 지갑을 연결해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (!currentRound) {
      toast({
        title: '라운드 없음',
        description: '현재 진행 중인 라운드가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (currentRound.status !== 'BETTING_OPEN') {
      toast({
        title: '베팅 불가',
        description: '현재 베팅할 수 없는 상태입니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsBettingModalOpen(true);
  };

  // 베팅 성공 핸들러
  const handleBetSuccess = () => {
    toast({
      title: '베팅 성공! 🎉',
      description: '베팅이 성공적으로 등록되었습니다.',
    });
    loadCurrentRound(); // 라운드 정보 갱신
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
    <div className="relative min-h-screen overflow-hidden bg-[#02040a] text-slate-50 px-2 py-3 sm:px-4 sm:py-6">
      {/* 배경 그라디언트 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-[-10rem] h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-purple-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#020617,_#000)] opacity-70" />
      </div>

      {/* 전체 레이아웃 컨테이너 */}
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col rounded-[32px] px-3 pb-6 pt-3 shadow-[0_0_80px_rgba(0,0,0,0.85)] lg:px-6">
        {/* 상단 글로벌 헤더 */}
        <header className="mb-3 flex items-center justify-between rounded-[24px] border border-slate-800/80 bg-slate-950/80 px-4 shadow-lg shadow-black/40 backdrop-blur-md lg:px-5">
          {/* 로고 + 타이틀 */}
          <div className="flex items-center gap-3">
            <div className="relative h-18 w-18 overflow-hidden rounded-2xl ">
              <Image
                src="/logo.png"
                alt="DeltaX Logo"
                fill
                className="object-contain p-1.5"
                priority
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-sm font-extrabold tracking-[0.22em] text-transparent lg:text-base">
                DELTA X
              </span>
            </div>
          </div>

          {/* 헤더 오른쪽: 타임프레임 탭 + 연결 상태 */}
          <div className="flex items-center gap-3">
            {/* 타임프레임 탭 */}
            <Tabs
              value={timeframe}
              onValueChange={(v) => setTimeframe(v as '1M' | '6H' | '1D')}
              className="hidden rounded-full border border-slate-700/70 bg-slate-900/70 px-1 py-0.5 text-xs text-slate-300 sm:block"
            >
              <TabsList className="h-7 bg-transparent">
                <TabsTrigger value="1M" className="h-6 rounded-full px-3 text-[11px]">
                  1 MIN
                </TabsTrigger>
                <TabsTrigger value="6H" className="h-6 rounded-full px-3 text-[11px]">
                  6 HOUR
                </TabsTrigger>
                <TabsTrigger value="1D" className="h-6 rounded-full px-3 text-[11px]">
                  1 DAY
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* 연결 상태 뱃지 */}
            {isConnected ? (
              <Card className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-3 py-1.5 text-xs shadow-md shadow-emerald-500/25">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-semibold text-emerald-100">Connected</span>
                </div>
                <span className="max-w-[120px] truncate font-mono text-[11px] text-emerald-200/80 max-sm:hidden">
                  {displayAddress}
                </span>
                <Button
                  onClick={handleDisconnect}
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-6 w-6 rounded-full text-emerald-300 hover:bg-emerald-500/10 hover:text-red-300"
                >
                  <LogOut className="h-3 w-3" />
                </Button>
              </Card>
            ) : (
              <Button
                onClick={handleConnect}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/40 transition-all hover:from-cyan-400 hover:to-purple-400 hover:shadow-cyan-400/50"
              >
                <Wallet className="h-4 w-4" />
                <span>지갑 연결</span>
              </Button>
            )}
          </div>
        </header>

        {/* 메인 그리드: 좌측 마켓 / 중앙 차트 / 우측 내 정보 */}
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

            <Card className="border border-slate-800/80 rounded-2xl bg-slate-950/80 p-4 shadow-lg shadow-black/40">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  마켓 스냅샷
                </div>
                <span className="rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-500">
                  데모 데이터
                </span>
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GOLD 변동률
                  </span>
                  <span className="font-mono text-xs text-emerald-300">+1.42%</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> BTC 변동률
                  </span>
                  <span className="font-mono text-xs text-red-300">-0.87%</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    풀 규모 (DEL)
                  </span>
                  <span className="font-mono text-xs text-cyan-300">1,234,000</span>
                </div>
              </div>
            </Card>
          </section>
        </div>
      </div>

      {/* 베팅 모달 */}
      <BettingModal
        isOpen={isBettingModalOpen}
        onClose={() => setIsBettingModalOpen(false)}
        round={currentRound}
        userAddress={walletAddress}
        onBetSuccess={handleBetSuccess}
      />
    </div>
  );
}
