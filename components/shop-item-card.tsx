'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Palette, User, Box, Hexagon } from 'lucide-react';
import { ShopItem } from '@/db/schema/shopItems';

interface ShopItemCardProps {
  item: ShopItem;
  onPurchase: (item: ShopItem) => Promise<void>;
  disabled?: boolean;
}

export function ShopItemCard({ item, onPurchase, disabled }: ShopItemCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePurchase = async () => {
    setIsLoading(true);
    try {
      await onPurchase(item);
    } finally {
      setIsLoading(false);
    }
  };

  const getIcon = () => {
    switch (item.category) {
      case 'NICKNAME':
        return <User className="h-8 w-8 text-blue-600" />;
      case 'COLOR':
        return <Palette className="h-8 w-8 text-purple-600" />;
      case 'NFT':
        return <Hexagon className="h-8 w-8 text-cyan-600" />;
      case 'BOOST':
        return <Zap className="h-8 w-8 text-yellow-600" />;
      default:
        return <Box className="h-8 w-8 text-slate-600" />;
    }
  };

  const getCategoryColor = () => {
    switch (item.category) {
      case 'NICKNAME':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'COLOR':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
      case 'NFT':
        return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30';
      case 'BOOST':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      default:
        return 'bg-slate-500/10 text-slate-600 border-slate-500/30';
    }
  };

  return (
    <Card className="group relative overflow-hidden border-cyan-500/30 bg-white/90 backdrop-blur-sm p-5 transition-all hover:border-cyan-500/50 hover:bg-white hover:shadow-lg hover:shadow-cyan-500/20">
      <div className="flex items-start justify-between">
        {item.imageUrl ? (
          <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-cyan-500/30">
            {item.imageUrl.startsWith('ipfs://') ? (
              // IPFS URL은 일반 img 태그 사용
              <img
                src={item.imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            ) : (
              // 일반 URL은 Next.js Image 컴포넌트 사용
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized={item.imageUrl.startsWith('http')}
              />
            )}
          </div>
        ) : (
          <div className={`rounded-xl border p-3 ${getCategoryColor()}`}>{getIcon()}</div>
        )}
        {item.tier && (
          <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/20 text-cyan-700">
            {item.tier}
          </Badge>
        )}
      </div>

      <div className="mt-4">
        <h3 className="font-bold text-cyan-800 group-hover:text-cyan-600 transition-colors">
          {item.name}
        </h3>
        <p className="mt-1 text-xs text-slate-600 line-clamp-2 min-h-[2.5em]">
          {item.description || '아이템 설명이 없습니다.'}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-medium text-cyan-600 uppercase tracking-wider">
            Price
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-lg font-bold ${item.currency === 'DEL' ? 'text-cyan-700' : 'text-pink-600'}`}
            >
              {item.price.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-slate-600">{item.currency}</span>
          </div>
        </div>

        <Button
          onClick={handlePurchase}
          disabled={disabled || isLoading || !item.available}
          size="sm"
          className={`
            h-9 px-4 font-semibold transition-all
            ${
              item.currency === 'DEL'
                ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                : 'bg-gradient-to-r from-pink-600 to-purple-600 text-white hover:shadow-lg hover:shadow-pink-500/50'
            }
          `}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '구매'}
        </Button>
      </div>
    </Card>
  );
}
