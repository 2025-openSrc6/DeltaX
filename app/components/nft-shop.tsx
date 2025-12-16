'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Wallet, Zap } from 'lucide-react';
import { NFTCard } from '@/components/nft-card';

// Mock NFT data
const nfts = [
  {
    id: 1,
    name: 'Tiger - Obsidian',
    image: '/images/tiger%20-%20obsidian.png',
    price: 300000,
    rarity: 'Legendary',
    description: 'Obsidian 등급의 호랑이 NFT',
  },
  {
    id: 2,
    name: 'Blue Dragon - Aurum',
    image: '/images/blue%20dragon%20-%20aurum.png',
    price: 500000,
    rarity: 'Epic',
    description: 'Aurum 등급의 푸른 용 NFT',
  },
  {
    id: 3,
    name: 'Sky - Nova',
    image: '/images/sky%20-%20nova.png',
    price: 1000000,
    rarity: 'Epic',
    description: 'Nova 등급의 하늘 NFT',
  },
  {
    id: 4,
    name: 'Taegeuk - Aetherion',
    image: '/images/taegeuk%20-%20aetherion.png',
    price: 2000000,
    rarity: 'Rare',
    description: 'Aetherion 등급의 태극 NFT',
  },
  {
    id: 5,
    name: 'Star - Singularity',
    image: '/images/star%20-%20singularity.png',
    price: 100000000,
    rarity: 'Legendary',
    description: 'Singularity 등급의 별 NFT',
  },
  {
    id: 6,
    name: 'Otter - Obsidian',
    image: '/images/otter%20-%20obsidian.png',
    price: 300000,
    rarity: 'Rare',
    description: 'Obsidian 등급의 수달 NFT',
  },
  {
    id: 7,
    name: 'Crane - Obsidian',
    image: '/images/crane%20-%20obsidian.png',
    price: 300000,
    rarity: 'Epic',
    description: 'Obsidian 등급의 학 NFT',
  },
  {
    id: 8,
    name: 'White Tiger - Aurum',
    image: '/images/white%20tiger%20-%20aurum.png',
    price: 500000,
    rarity: 'Epic',
    description: 'Aurum 등급의 백호 NFT',
  },
];

export function NFTShop() {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [userPoints, setUserPoints] = useState(15000);

  const handleConnectWallet = () => {
    // Simulate wallet connection
    setIsConnected(true);
    setWalletAddress('0x742d...9f3a');
  };

  const handleDisconnectWallet = () => {
    setIsConnected(false);
    setWalletAddress('');
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
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-cyan-500/20 backdrop-blur-xl bg-slate-950/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 flex-shrink-0">
                <Image src="/logo.png" alt="DeltaX Logo" fill className="object-contain" priority />
              </div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-lg">
                NFT SHOP
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {isConnected && (
                <Card className="px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/50 backdrop-blur-sm hover:border-cyan-400/80 transition-all duration-300 shadow-lg shadow-cyan-500/20">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-cyan-400 animate-pulse" />
                    <span className="font-mono font-bold text-cyan-300">
                      {userPoints.toLocaleString()}
                    </span>
                    <span className="text-sm text-cyan-200/60">PTS</span>
                  </div>
                </Card>
              )}

              {isConnected ? (
                <Button
                  onClick={handleDisconnectWallet}
                  className="border border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-500/10 bg-transparent text-cyan-300 transition-all duration-300"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  {walletAddress}
                </Button>
              ) : (
                <Button
                  onClick={handleConnectWallet}
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

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-cyan-500/20">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-80 h-80 bg-pink-500/5 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.08),transparent_70%)]" />

        <div className="container relative mx-auto px-4 py-32 md:py-40">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-6xl md:text-7xl font-black mb-4 bg-gradient-to-b from-cyan-300 via-cyan-400 to-purple-500 bg-clip-text text-transparent drop-shadow-2xl">
              DIGITAL LEGENDS
            </h1>
            <p className="text-cyan-300/80 text-lg mb-8 font-mono tracking-wider">
              [ MINT • COLLECT • DOMINATE ]
            </p>
            <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full shadow-lg shadow-cyan-500/50 mb-8" />
          </div>
        </div>
      </section>

      {/* NFT Grid */}
      <section className="relative bg-slate-950 py-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.06),transparent_70%)]" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />

        <div className="container relative mx-auto px-4">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-2 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              LEGENDARY COLLECTION
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full shadow-lg shadow-cyan-500/50" />
          </div>

          {!isConnected && (
            <Card className="mb-12 p-8 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 border border-cyan-500/40 backdrop-blur-sm hover:border-cyan-400/70 transition-all duration-300 shadow-lg shadow-cyan-500/10">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
                <div>
                  <h3 className="text-xl font-bold mb-2 text-cyan-300">GENESIS INITIATED</h3>
                  <p className="text-cyan-200/70 font-mono">
                    Connect wallet to activate your digital existence
                  </p>
                </div>
                <Button
                  onClick={handleConnectWallet}
                  className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:shadow-lg hover:shadow-cyan-500/60 transition-all duration-300 px-8 py-3 whitespace-nowrap font-bold text-white"
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
