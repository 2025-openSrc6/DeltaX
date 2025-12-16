'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Wallet, Zap } from 'lucide-react';
import { NFTCard } from '@/components/nft-card';
import {
  useCurrentWallet,
  useConnectWallet,
  useWallets,
  useDisconnectWallet,
  useSignPersonalMessage,
} from '@mysten/dapp-kit';
import { useToast } from '@/hooks/use-toast';

// Mock NFT data
const nfts = [
  {
    id: 1,
    name: 'Cyber Dragon #001',
    image: '/futuristic-cyber-dragon-nft-digital-art-neon.jpg',
    price: 5000,
    rarity: 'Legendary',
    description: 'A legendary cyber dragon with neon scales',
  },
  {
    id: 2,
    name: 'Neon Samurai #042',
    image: '/neon-samurai-warrior-cyberpunk-nft-art.jpg',
    price: 3500,
    rarity: 'Epic',
    description: 'Elite warrior from the neon districts',
  },
  {
    id: 3,
    name: 'Pixel Phoenix #128',
    image: '/pixel-art-phoenix-bird-fire-nft.jpg',
    price: 4200,
    rarity: 'Epic',
    description: 'Rising from digital ashes',
  },
  {
    id: 4,
    name: 'Quantum Tiger #007',
    image: '/quantum-tiger-holographic-nft-digital-art.jpg',
    price: 2800,
    rarity: 'Rare',
    description: 'Prowling through quantum dimensions',
  },
  {
    id: 5,
    name: 'Holo Serpent #099',
    image: '/holographic-serpent-snake-nft-futuristic.jpg',
    price: 6500,
    rarity: 'Legendary',
    description: 'Slithering through holographic realms',
  },
  {
    id: 6,
    name: 'Cyber Wolf #256',
    image: '/cyber-wolf-robot-nft-digital-art-neon.jpg',
    price: 3000,
    rarity: 'Rare',
    description: 'Alpha of the digital pack',
  },
  {
    id: 7,
    name: 'Neon Panther #512',
    image: '/neon-panther-cat-cyberpunk-nft-art.jpg',
    price: 3800,
    rarity: 'Epic',
    description: 'Silent hunter of the neon jungle',
  },
  {
    id: 8,
    name: 'Plasma Eagle #333',
    image: '/plasma-eagle-bird-electric-nft-digital.jpg',
    price: 4500,
    rarity: 'Epic',
    description: 'Soaring through plasma storms',
  },
];

export function NFTShop() {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [userPoints, setUserPoints] = useState(0);
  const [userNickname, setUserNickname] = useState<string | null>(null);
  const [nicknameColor, setNicknameColor] = useState<string | null>(null);

  const { currentWallet } = useCurrentWallet();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const wallets = useWallets();
  const { mutate: disconnectWallet } = useDisconnectWallet();
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
          setUserPoints(data.data.user.delBalance || 0);
          setUserNickname(data.data.user.nickname || null);
          setNicknameColor(data.data.user.nicknameColor || data.data.user.profileColor || null);
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

  // 닉네임 색상 스타일 생성
  const getNicknameStyle = () => {
    const color = nicknameColor || null;
    if (!color) return {};

    // RAINBOW인 경우 그라디언트 적용
    if (color === 'RAINBOW') {
      return {
        background:
          'linear-gradient(to right, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      };
    }

    // 일반 색상인 경우
    return {
      color: color,
      textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    };
  };

  const displayAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : '';

  const handleConnect = async () => {
    // 사용 가능한 지갑이 없으면 에러 처리
    if (wallets.length === 0) {
      alert('사용 가능한 지갑이 없습니다. Sui 지갑 확장 프로그램을 설치해주세요.');
      return;
    }

    try {
      // 첫 번째 사용 가능한 지갑 사용
      const wallet = wallets[0];
      const result = await connectWallet({ wallet });

      const account = result?.accounts?.[0] ?? currentWallet?.accounts?.[0] ?? wallet.accounts?.[0];

      if (!account) {
        throw new Error('지갑 연결 결과에 계정이 없습니다.');
      }

      const address = account.address;
      setIsConnected(true);
      setWalletAddress(address);

      // 서명 요청
      const nonce = crypto.randomUUID();
      const expMs = Date.now() + 5 * 60_000; // 5분 유효
      const domain = typeof window !== 'undefined' ? window.location.host : 'deltax.app';
      const message = `DeltaX Login\nDomain: ${domain}\nNonce: ${nonce}\nExp: ${expMs}`;

      const signed = await signPersonalMessage({
        message: new TextEncoder().encode(message),
      });

      const signature = signed.signature;
      const rawBytes = signed.bytes as string | Uint8Array;
      const signedMessageBytes =
        typeof rawBytes === 'string'
          ? rawBytes
          : btoa(String.fromCharCode.apply(null, Array.from(rawBytes)));

      // 서버에 인증 요청
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          suiAddress: address,
          signature: signature,
          message: message,
          signedMessageBytes: signedMessageBytes,
        }),
      });

      const data = await response.json();
      if (data.success && data.data?.user) {
        setUserPoints(data.data.user.delBalance || 0);
        setUserNickname(data.data.user.nickname || null);
        setNicknameColor(data.data.user.nicknameColor || data.data.user.profileColor || null);
        toast({
          title: '로그인 성공',
          description: '지갑이 연결되었습니다.',
        });
      }
    } catch (error) {
      console.error('지갑 연결 실패:', error);
      toast({
        title: '연결 실패',
        description: '지갑 연결에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDisconnect = async () => {
    disconnectWallet();
    setIsConnected(false);
    setWalletAddress('');
    setUserPoints(0);
    setUserNickname(null);
    setNicknameColor(null);

    // 서버 세션도 삭제
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  };

  const handlePurchase = (nftId: number, price: number) => {
    if (userPoints >= price) {
      setUserPoints((prev) => prev - price);
      // Here you would trigger the actual NFT minting
      alert('NFT minted successfully! Check your wallet.');
    } else {
      alert('Insufficient points!');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-cyan-300/30 backdrop-blur-xl bg-white/90 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3">
                <div className="relative w-16 h-16 flex-shrink-0">
                  <Image
                    src="/logo.png"
                    alt="DeltaX Logo"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  NFT SHOP
                </h1>
              </Link>
            </div>

            <div className="flex items-center gap-4">
              {isConnected && (
                <Card className="px-4 py-2 bg-gradient-to-r from-cyan-50 to-purple-50 border border-cyan-200 hover:border-cyan-300 transition-all duration-300 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-cyan-600 animate-pulse" />
                    <span className="font-mono font-bold text-cyan-700">
                      {userPoints.toLocaleString()}
                    </span>
                    <span className="text-sm text-cyan-600/70">DEL</span>
                  </div>
                </Card>
              )}

              {isConnected ? (
                <Button
                  onClick={handleDisconnect}
                  className="border border-cyan-400 hover:border-cyan-500 hover:bg-cyan-50 bg-white text-cyan-700 transition-all duration-300 shadow-sm"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  <span style={getNicknameStyle()}>{userNickname || displayAddress}</span>
                </Button>
              ) : (
                <Button
                  onClick={handleConnect}
                  className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:shadow-lg hover:shadow-cyan-400/50 transition-all duration-300 text-white font-bold"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-cyan-200/50 bg-gradient-to-br from-cyan-50/50 to-purple-50/50">
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-cyan-200/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-80 h-80 bg-pink-200/10 rounded-full blur-3xl" />

        <div className="container relative mx-auto px-4 py-32 md:py-40">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-6xl md:text-7xl font-black mb-4 bg-gradient-to-b from-cyan-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              DIGITAL LEGENDS
            </h1>
            <p className="text-cyan-700/80 text-lg mb-8 font-mono tracking-wider">
              [ MINT • COLLECT • DOMINATE ]
            </p>
            <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full shadow-lg shadow-cyan-300/50 mb-8" />
          </div>
        </div>
      </section>

      {/* NFT Grid */}
      <section className="relative bg-gradient-to-br from-slate-50 to-blue-50 py-20">
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-200/10 rounded-full blur-3xl" />

        <div className="container relative mx-auto px-4">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-2 bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent">
              LEGENDARY COLLECTION
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full shadow-lg shadow-cyan-300/50" />
          </div>

          {!isConnected && (
            <Card className="mb-12 p-8 bg-gradient-to-br from-cyan-50 to-purple-50 border border-cyan-200 hover:border-cyan-300 transition-all duration-300 shadow-md">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
                <div>
                  <h3 className="text-xl font-bold mb-2 text-cyan-700">GENESIS INITIATED</h3>
                  <p className="text-cyan-600/70 font-mono">
                    Connect wallet to activate your digital existence
                  </p>
                </div>
                <Button
                  onClick={handleConnect}
                  className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:shadow-lg hover:shadow-cyan-300/50 transition-all duration-300 px-8 py-3 whitespace-nowrap font-bold text-white"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  ACTIVATE
                </Button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {nfts.map((nft) => (
              <NFTCard
                key={nft.id}
                nft={nft}
                isConnected={isConnected}
                userPoints={userPoints}
                onPurchase={handlePurchase}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
