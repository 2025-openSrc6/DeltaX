'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Wallet, LogOut, ArrowLeft, ShoppingBag, Filter, Rocket } from 'lucide-react';
import { ShopItem } from '@/db/schema/shopItems';
import { ShopItemCard } from '@/components/shop-item-card';
import { NicknameModal } from '@/components/NicknameModal';
import { toast } from 'sonner';
import {
  useCurrentWallet,
  useConnectWallet,
  useWallets,
  useDisconnectWallet,
  useSignPersonalMessage,
  useSignTransaction,
} from '@mysten/dapp-kit';
import { fromBase64 } from '@mysten/sui/utils';

// Crystal Items Definition
const CRYSTAL_ITEMS: ShopItem[] = [
  {
    id: 'crystal_pack_10',
    category: 'ITEM',
    name: '💎 Crystal 10개 (SUI 결제)',
    description: '0.1 SUI를 지불하고 Crystal 10개를 구매합니다.',
    price: 0.1,
    currency: 'SUI',
    imageUrl: '/images/crystal_pack_10.png',
    available: true,
    tier: null,
    requiresNickname: false,
    metadata: JSON.stringify({ crystalAmount: 10 }),
    createdAt: Date.now(),
  },
  {
    id: 'crystal_pack_50',
    category: 'ITEM',
    name: '💎 Crystal 50개 (SUI 결제)',
    description: '0.5 SUI를 지불하고 Crystal 50개를 구매합니다. (보너스 포함!)',
    price: 0.5,
    currency: 'SUI',
    imageUrl: '/images/crystal_pack_50.png',
    available: true,
    tier: null,
    requiresNickname: false,
    metadata: JSON.stringify({ crystalAmount: 50 }),
    createdAt: Date.now(),
  },
];

// Static Shop Items (DB 연결 문제 회피용 Fallback)
const SHOP_ITEMS: ShopItem[] = [
  // --- 닉네임 & 컬러 ---
  {
    id: 'item_nickname',
    category: 'NICKNAME',
    name: '닉네임 변경권',
    description: '닉네임을 설정할 수 있습니다.',
    price: 50000,
    currency: 'DEL',
    requiresNickname: false,
    imageUrl:
      'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=500&auto=format&fit=crop&q=60',
    available: true,
    tier: null,
    metadata: null,
    createdAt: Date.now(),
  },
  {
    id: 'item_color_single',
    category: 'COLOR',
    name: '닉네임 컬러 (단색)',
    description: '닉네임에 단색 컬러를 적용합니다.',
    price: 20000,
    currency: 'DEL',
    requiresNickname: true,
    metadata: JSON.stringify({ color: '#FF5733' }),
    imageUrl:
      'https://images.unsplash.com/photo-1505909182942-e2f09aee3e89?w=500&auto=format&fit=crop&q=60',
    available: true,
    tier: null,
    createdAt: Date.now(),
  },
  {
    id: 'item_color_special',
    category: 'COLOR',
    name: '닉네임 컬러 (스페셜)',
    description: '2중/3중/무지개 컬러를 적용합니다.',
    price: 100000,
    currency: 'DEL',
    requiresNickname: true,
    metadata: JSON.stringify({ color: 'RAINBOW' }),
    imageUrl:
      'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=500&auto=format&fit=crop&q=60',
    available: true,
    tier: null,
    createdAt: Date.now(),
  },

  // --- NFT Tiers ---
  {
    id: 'nft_obsidian',
    category: 'NFT',
    name: 'Obsidian Tier NFT',
    description: 'Obsidian 등급의 NFT입니다.',
    tier: 'Obsidian',
    price: 300000,
    currency: 'DEL',
    imageUrl: '/images/tiger%20-%20obsidian.png',
    available: true,
    requiresNickname: false,
    metadata: null,
    createdAt: Date.now(),
  },
  {
    id: 'nft_aurum',
    category: 'NFT',
    name: 'Aurum Tier NFT',
    description: 'Aurum 등급의 NFT입니다.',
    tier: 'Aurum',
    price: 500000,
    currency: 'DEL',
    imageUrl: '/images/blue%20dragon%20-%20aurum.png',
    available: true,
    requiresNickname: false,
    metadata: null,
    createdAt: Date.now(),
  },
  {
    id: 'nft_nova',
    category: 'NFT',
    name: 'Nova Tier NFT',
    description: 'Nova 등급의 NFT입니다.',
    tier: 'Nova',
    price: 1000000,
    currency: 'DEL',
    imageUrl: '/images/sky%20-%20nova.png',
    available: true,
    requiresNickname: false,
    metadata: null,
    createdAt: Date.now(),
  },
  {
    id: 'nft_aetherion',
    category: 'NFT',
    name: 'Aetherion Tier NFT',
    description: 'Aetherion 등급의 NFT입니다.',
    tier: 'Aetherion',
    price: 2000000,
    currency: 'DEL',
    imageUrl: '/images/taegeuk%20-%20aetherion.png',
    available: true,
    requiresNickname: false,
    metadata: null,
    createdAt: Date.now(),
  },
  {
    id: 'nft_singularity',
    category: 'NFT',
    name: 'Singularity Tier NFT',
    description: 'Singularity 등급의 NFT입니다.',
    tier: 'Singularity',
    price: 100000000,
    currency: 'DEL',
    imageUrl: '/images/star%20-%20singularity.png',
    available: true,
    requiresNickname: false,
    metadata: null,
    createdAt: Date.now(),
  },

  // --- 아이템 (Crystal) ---
  {
    id: 'item_boost_1day',
    category: 'BOOST',
    name: '부스트 토큰 (1일)',
    description: '1일간 베팅 성공 보상 +5%, 출석 포인트 +10%',
    price: 2,
    currency: 'CRYSTAL',
    metadata: JSON.stringify({ durationMs: 86400000 }),
    imageUrl:
      'https://images.unsplash.com/photo-1639815188546-c43c240ff4df?w=500&auto=format&fit=crop&q=60',
    available: true,
    tier: null,
    requiresNickname: false,
    createdAt: Date.now(),
  },
  {
    id: 'item_green_mushroom',
    category: 'ITEM',
    name: 'Green Mushroom',
    description: '베팅 실패 시 투자 금액 50% 회수 (1회)',
    price: 2,
    currency: 'CRYSTAL',
    imageUrl: '/images/item_green_mushroom.png',
    available: true,
    tier: null,
    requiresNickname: false,
    metadata: null,
    createdAt: Date.now(),
  },

  // --- Crystal Items는 별도 상수(CRYSTAL_ITEMS)로 관리되어 API 결과와 병합됨 ---
];

export default function ShopPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [delBalance, setDelBalance] = useState(0);
  const [crystalBalance, setCrystalBalance] = useState(0);
  const [boostCount, setBoostCount] = useState(0);
  const [greenMushroomCount, setGreenMushroomCount] = useState(0);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [sessionChecked, setSessionChecked] = useState(false); // 세션 확인 완료 여부

  // 닉네임 모달 상태
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [pendingNicknameItem, setPendingNicknameItem] = useState<ShopItem | null>(null);
  const [currentNickname, setCurrentNickname] = useState<string | undefined>(undefined);

  // dapp-kit 훅
  const { currentWallet } = useCurrentWallet();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const wallets = useWallets();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutateAsync: signTransaction } = useSignTransaction();

  // 구매 진행 중 상태
  const [, setPurchasingItemId] = useState<string | null>(null);

  // Mock User ID for purchase (나중에 walletAddress로 대체)
  const userId = walletAddress || 'test-user-id';

  // Tier 순서 정의
  const tierOrder: Record<string, number> = {
    Obsidian: 1,
    Aurum: 2,
    Nova: 3,
    Aetherion: 4,
    Singularity: 5,
  };

  // 온체인 DEL 잔액 조회 함수
  const fetchOnChainBalance = useCallback(async (address: string) => {
    try {
      const res = await fetch(`/api/shop/balance?address=${address}`);
      const data = await res.json();
      if (data.success && data.data) {
        setDelBalance(data.data.balanceNumber || 0);
      }
    } catch (error) {
      console.error('Failed to fetch on-chain DEL balance:', error);
    }
  }, []);

  // 페이지 로드 시 세션에서 지갑 상태 및 잔액 복원
  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.user) {
          const address = data.data.user.suiAddress;
          setIsConnected(true);
          setWalletAddress(address);
          // DEL은 온체인에서 조회 (DB 값 사용 안함)
          fetchOnChainBalance(address);
          setCrystalBalance(data.data.user.crystalBalance || 0);
          // 부스트 활성 여부 계산 (boostUntil이 현재 시간 이후면 활성)
          const boostUntil = data.data.user.boostUntil || 0;
          setBoostCount(boostUntil > Date.now() ? 1 : 0);
          setGreenMushroomCount(data.data.user.greenMushrooms || 0);
          // 닉네임 저장
          if (data.data.user.nickname) {
            setCurrentNickname(data.data.user.nickname);
          }
          setSessionChecked(true);
        } else {
          // 세션이 없거나 만료됨 - 지갑이 autoConnect 되어도 UI는 로그아웃 상태로 표시
          setIsConnected(false);
          setWalletAddress('');
          setSessionChecked(true);
          console.log('⚠️ No valid session, showing as logged out');
        }
      })
      .catch(() => {
        // 세션 확인 실패 시에도 로그아웃 상태로
        setIsConnected(false);
        setWalletAddress('');
        setSessionChecked(true);
      });
  }, [fetchOnChainBalance]);

  // currentWallet 상태 동기화 및 온체인 잔액 조회
  // 세션 확인이 완료된 후에만 autoConnect로 인한 연결 처리
  useEffect(() => {
    // 세션 확인이 안 끝났으면 무시 (세션 확인 결과가 우선)
    if (!sessionChecked) return;

    // 이미 로그인 상태면 무시 (세션에서 이미 처리됨)
    if (isConnected) return;

    // autoConnect로 지갑만 연결된 상태 - 세션이 없으면 연결 UI 안 보여줌
    // (사용자가 "지갑 연결" 버튼을 눌러서 세션 생성해야 함)
  }, [currentWallet, sessionChecked, isConnected]);

  // DB에서 아이템 불러오기 + Crystal 아이템 병합
  useEffect(() => {
    const fetchItems = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/nfts/shop');
        const data = await res.json();

        if (data.success && data.data?.items) {
          // DB 아이템 + Crystal 아이템 병합
          // 중복 방지: Crystal 아이템 ID가 이미 있는지 확인
          const dbItems = data.data.items as ShopItem[];
          const mergedItems = [...dbItems];

          CRYSTAL_ITEMS.forEach((crystalItem) => {
            if (!mergedItems.some((i) => i.id === crystalItem.id)) {
              mergedItems.push(crystalItem);
            }
          });

          setItems(mergedItems);
          console.log(`✅ Loaded ${dbItems.length} items from DB + merged Crystal items`);
        } else {
          // API 실패 시 Fallback + Crystal
          const fallbackItems = [...SHOP_ITEMS];
          CRYSTAL_ITEMS.forEach((crystalItem) => {
            if (!fallbackItems.some((i) => i.id === crystalItem.id)) {
              fallbackItems.push(crystalItem);
            }
          });
          setItems(fallbackItems);
          console.log('⚠️ Using fallback static data');
        }
      } catch (error) {
        console.error('Failed to load items:', error);
        // Error 시 Fallback + Crystal
        const fallbackItems = [...SHOP_ITEMS];
        CRYSTAL_ITEMS.forEach((crystalItem) => {
          if (!fallbackItems.some((i) => i.id === crystalItem.id)) {
            fallbackItems.push(crystalItem);
          }
        });
        setItems(fallbackItems);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, []);

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
    const expMs = Date.now() + 5 * 60_000;
    const message = buildLoginMessage(nonce, expMs);

    const encoder = new TextEncoder();
    let signature: string;
    let signedMessageBytes: string;

    try {
      const signed = await signPersonalMessage({
        message: encoder.encode(message),
      });

      signature = signed.signature;
      const rawBytes = signed.bytes as string | Uint8Array;
      if (typeof rawBytes === 'string') {
        signedMessageBytes = rawBytes;
      } else {
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

    const parsed = await response.json();

    if (!response.ok || !parsed.success) {
      throw new Error(parsed.error?.message || '로그인에 실패했습니다.');
    }

    setIsConnected(true);
    setWalletAddress(address);
  };

  const handleConnect = async () => {
    if (wallets.length === 0) {
      toast.error('사용 가능한 지갑이 없습니다. Sui 지갑 확장 프로그램을 설치해주세요.');
      return;
    }

    try {
      const wallet = wallets[0];
      const result = await connectWallet({ wallet });

      const account = result?.accounts?.[0] ?? currentWallet?.accounts?.[0] ?? wallet.accounts?.[0];

      if (!account) {
        throw new Error('지갑 연결 결과에 계정이 없습니다.');
      }

      await requestSession(account.address);
      toast.success('지갑이 연결되었습니다.');
    } catch (error) {
      if (isUserRejectionError(error)) {
        console.info('사용자가 지갑 요청을 취소했습니다.');
        return;
      }

      console.error('지갑 연결 중 오류:', error);
      const message = error instanceof Error ? error.message : '지갑 연결 중 오류가 발생했습니다.';
      toast.error(message);
    }
  };

  const handleDisconnect = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});

    if (currentWallet) {
      if (currentWallet.features && currentWallet.features['standard:disconnect']) {
        const disconnectFeature = currentWallet.features['standard:disconnect'];
        await disconnectFeature.disconnect();
      } else {
        disconnectWallet();
      }
    } else {
      disconnectWallet();
    }

    setIsConnected(false);
    setWalletAddress('');
    toast.success('지갑 연결이 해제되었습니다.');
  };

  // DEL 토큰 구매 (2단계 플로우: prepare → sign → execute)
  const handleDelPurchase = async (item: ShopItem, nickname?: string) => {
    if (!isConnected || !walletAddress) {
      toast.error('지갑을 먼저 연결해주세요.');
      return;
    }

    if (delBalance < item.price) {
      toast.error('DEL 잔액이 부족합니다.');
      return;
    }

    setPurchasingItemId(item.id);

    try {
      // Step 1: Prepare (서버에서 txBytes 생성)
      const prepareRes = await fetch('/api/shop/purchase/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          itemId: item.id,
        }),
      });
      const prepareData = await prepareRes.json();

      if (!prepareData.success) {
        toast.error(prepareData.message || '구매 준비에 실패했습니다.');
        return;
      }

      console.log('✅ Prepare success:', prepareData.data);

      // Step 2: 지갑에서 서명
      toast.info('지갑에서 트랜잭션에 서명해주세요.');

      // txBytes를 Transaction 객체로 변환 후 서명
      const { Transaction } = await import('@mysten/sui/transactions');
      const txBytes = fromBase64(prepareData.data.txBytes);
      const transaction = Transaction.from(txBytes);

      const { signature } = await signTransaction({
        transaction,
      });

      console.log('✅ User signed, signature:', signature.slice(0, 20) + '...');

      // Step 3: Execute (서버에서 실행)
      const executeRes = await fetch('/api/shop/purchase/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txBytes: prepareData.data.txBytes,
          userSignature: signature,
          nonce: prepareData.data.nonce,
          itemId: item.id,
          userAddress: walletAddress,
          newNickname: nickname, // 닉네임 변경권인 경우
        }),
      });
      const executeData = await executeRes.json();

      if (executeData.success) {
        toast.success(`${item.name} 구매 완료! TX: ${executeData.data.digest.slice(0, 10)}...`);

        // 온체인 잔액 다시 조회
        await fetchOnChainBalance(walletAddress);

        // 닉네임 변경 시 현재 닉네임 업데이트
        if (item.category === 'NICKNAME' && nickname) {
          setCurrentNickname(nickname);
        }

        // 부스트 구매 시 ON으로 변경
        if (item.category === 'BOOST') {
          setBoostCount(1); // ON 상태
        }

        // 버섯 구매 시 개수 증가
        if (item.category === 'ITEM' && item.id.includes('mushroom')) {
          setGreenMushroomCount((prev) => prev + 1);
        }
      } else {
        toast.error(executeData.message || '구매에 실패했습니다.');
      }
    } catch (error) {
      console.error('Purchase error:', error);

      // 지갑 연결 안됨 에러 체크
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isWalletDisconnected =
        errorMessage.includes('WalletNotConnected') ||
        errorMessage.includes('No wallet is connected') ||
        errorMessage.includes('not connected');

      if (isWalletDisconnected) {
        toast.error('로그인 세션 만료됨. 지갑을 다시 연결해주세요.', {
          duration: 5000,
          action: {
            label: '연결하기',
            onClick: handleConnect,
          },
        });
        setIsConnected(false);
        setWalletAddress('');
      } else if (error instanceof Error && /user rejected/i.test(error.message)) {
        toast.error('서명이 취소되었습니다.');
      } else {
        toast.error('구매 중 오류가 발생했습니다.');
      }
    } finally {
      setPurchasingItemId(null);
    }
  };

  // SUI로 Crystal 구매 (2단계 플로우)
  const handleSuiPurchase = async (item: ShopItem) => {
    if (!isConnected || !walletAddress) {
      toast.error('지갑을 먼저 연결해주세요.');
      return;
    }

    setPurchasingItemId(item.id);

    try {
      // Step 1: Prepare (서버에서 SUI 전송 txBytes 생성)
      const prepareRes = await fetch('/api/shop/crystal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare',
          userAddress: walletAddress,
          packageId: item.id,
        }),
      });
      const prepareData = await prepareRes.json();

      if (!prepareData.success) {
        toast.error(prepareData.message || 'Crystal 구매 준비에 실패했습니다.');
        return;
      }

      console.log('✅ Crystal Prepare success:', prepareData.data);
      toast.info(`${prepareData.data.suiAmount} SUI 전송에 서명해주세요.`);

      // Step 2: 지갑에서 서명
      const { Transaction } = await import('@mysten/sui/transactions');
      const txBytes = fromBase64(prepareData.data.txBytes);
      const transaction = Transaction.from(txBytes);

      const { signature } = await signTransaction({
        transaction,
      });

      console.log('✅ User signed for Crystal purchase');

      // Step 3: Execute (서버에서 실행 + DB 업데이트)
      const executeRes = await fetch('/api/shop/crystal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          userAddress: walletAddress,
          packageId: item.id,
          txBytes: prepareData.data.txBytes,
          userSignature: signature,
        }),
      });
      const executeData = await executeRes.json();

      if (executeData.success) {
        toast.success(`💎 ${executeData.data.crystalAmount} Crystal 구매 완료!`);
        setCrystalBalance(executeData.data.newBalance);
      } else {
        toast.error(executeData.message || 'Crystal 구매에 실패했습니다.');
      }
    } catch (error) {
      console.error('Crystal purchase error:', error);

      if (error instanceof Error && /user rejected/i.test(error.message)) {
        toast.error('서명이 취소되었습니다.');
      } else {
        toast.error('Crystal 구매 중 오류가 발생했습니다.');
      }
    } finally {
      setPurchasingItemId(null);
    }
  };

  const handlePurchase = async (item: ShopItem, nickname?: string) => {
    console.log('🛒 handlePurchase called:', item.category, item.name, 'nickname:', nickname);

    // 닉네임 변경권인 경우 모달을 먼저 열기 (지갑 연결 체크 전에)
    if (item.category === 'NICKNAME' && !nickname) {
      console.log('📝 Opening nickname modal');
      setPendingNicknameItem(item);
      setIsNicknameModalOpen(true);
      console.log('✅ Modal state set to true');
      return;
    }

    if (!isConnected) {
      console.log('❌ Not connected');
      toast.error('지갑을 먼저 연결해주세요.');
      return;
    }

    // DEL 토큰 구매 → 온체인 2단계 플로우 사용
    if (item.currency === 'DEL') {
      await handleDelPurchase(item, nickname);
      return;
    }

    // SUI 결제 (Crystal 구매) → 별도 API 사용
    if (item.currency === 'SUI') {
      await handleSuiPurchase(item);
      return;
    }

    // CRYSTAL 구매 → 기존 방식 유지
    const currentBalance = crystalBalance;
    if (currentBalance < item.price) {
      console.log('❌ Insufficient balance:', currentBalance, '<', item.price);
      toast.error('CRYSTAL 잔액이 부족합니다.');
      return;
    }

    try {
      const requestBody: { userId: string; itemId: string; newNickname?: string } = {
        userId,
        itemId: item.id,
      };

      // 닉네임 변경권인 경우 newNickname 포함
      if (item.category === 'NICKNAME' && nickname) {
        requestBody.newNickname = nickname;
      }

      console.log('📤 Sending purchase request:', requestBody);

      const res = await fetch('/api/nfts/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();

      console.log('📥 Purchase response:', data);

      if (data.success) {
        toast.success(`${item.name} 구매 완료!`);
        setCrystalBalance(data.data.newBalance);

        // 컬러 변경 시 알림
        if (item.category === 'COLOR') {
          toast.success('닉네임 컬러가 변경되었습니다!');
        }

        // 부스트 구매 시 ON으로 변경
        if (item.category === 'BOOST') {
          setBoostCount(1); // ON 상태
        }

        // 버섯 구매 시 개수 증가
        if (item.category === 'ITEM' && item.id.includes('mushroom')) {
          setGreenMushroomCount((prev) => prev + 1);
        }
      } else {
        toast.error(data.message || '구매 실패');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error('구매 중 오류가 발생했습니다.');
    }
  };

  // 닉네임 모달 확인 핸들러
  const handleNicknameConfirm = (nickname: string) => {
    setIsNicknameModalOpen(false);
    if (pendingNicknameItem) {
      handlePurchase(pendingNicknameItem, nickname);
      setPendingNicknameItem(null);
    }
  };

  const filteredItems = items
    .filter((item) => activeCategory === 'ALL' || item.category === activeCategory)
    .sort((a, b) => {
      // 1. NFT인 경우 Tier 순서로 정렬
      if (
        activeCategory === 'NFT' ||
        (activeCategory === 'ALL' && a.category === 'NFT' && b.category === 'NFT')
      ) {
        const tierA = tierOrder[a.tier || ''] || 99;
        const tierB = tierOrder[b.tier || ''] || 99;
        if (tierA !== tierB) return tierA - tierB;
      }
      // 2. 기본적으로 가격 오름차순 정렬
      return a.price - b.price;
    });

  const categories = [
    { id: 'ALL', label: '전체' },
    { id: 'NFT', label: 'NFT' },
    { id: 'NICKNAME', label: '닉네임' },
    { id: 'COLOR', label: '컬러' },
    { id: 'BOOST', label: '부스트' },
    { id: 'ITEM', label: '아이템' },
  ];

  // 닉네임이 있으면 닉네임, 없으면 지갑 주소 축약형 표시
  const displayName =
    currentNickname ||
    (walletAddress.length > 10
      ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
      : walletAddress);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 px-2 py-3 sm:px-4 sm:py-6">
      {/* Background Gradients */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-[-10rem] h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-purple-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col rounded-[32px] px-3 pb-6 pt-3 lg:px-6">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between rounded-[24px] border border-slate-200 bg-white/80 px-4 py-3 shadow-lg shadow-slate-200/50 backdrop-blur-md lg:px-5">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-white border border-slate-200 shadow">
                <Image
                  src="/logo.png"
                  alt="DeltaX Logo"
                  fill
                  className="object-contain p-1"
                  priority
                />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 leading-none">NFT SHOP</h1>
                <p className="text-[11px] text-slate-500 font-medium mt-1">
                  Digital Assets & Upgrades
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isConnected ? (
              <>
                <div className="hidden sm:flex items-center gap-3 rounded-full bg-white/90 border border-slate-200 px-3 py-1.5 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">DEL:</span>
                    <span className="text-sm font-bold text-cyan-600">
                      {delBalance.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">💎:</span>
                    <span className="text-sm font-bold text-pink-600">
                      {crystalBalance.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5" title="부스트 상태">
                    <Rocket className="h-3.5 w-3.5 text-orange-400" />
                    <span
                      className={`text-xs font-bold ${boostCount > 0 ? 'text-orange-400' : 'text-slate-500'}`}
                    >
                      {boostCount > 0 ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5" title="Green Mushroom">
                    <svg
                      className="h-3.5 w-3.5 text-green-400"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2C8 2 4 5 4 9c0 3 2 5 4 6v5c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-5c2-1 4-3 4-6 0-4-4-7-8-7zm0 2c3 0 6 2 6 5 0 2-1.5 3.5-3 4.3V19h-6v-5.7C7.5 12.5 6 11 6 9c0-3 3-5 6-5z" />
                      <circle cx="9" cy="8" r="1.5" />
                      <circle cx="15" cy="8" r="1.5" />
                      <circle cx="12" cy="11" r="1" />
                    </svg>
                    <span className="text-sm font-bold text-green-400">{greenMushroomCount}</span>
                  </div>
                </div>
                <Card className="flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs shadow-md shadow-emerald-200/50">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="font-semibold text-emerald-700">Connected</span>
                  </div>
                  <span className="max-w-[100px] truncate font-mono text-[11px] text-emerald-600 hidden sm:block">
                    {displayName}
                  </span>
                  <Button
                    onClick={handleDisconnect}
                    variant="ghost"
                    size="icon"
                    className="ml-1 h-6 w-6 rounded-full text-emerald-600 hover:bg-emerald-100 hover:text-red-500"
                  >
                    <LogOut className="h-3 w-3" />
                  </Button>
                </Card>
              </>
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

        {/* Main Content */}
        <div className="flex flex-col gap-6">
          {/* Banner */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/70 p-6 sm:p-10 shadow-xl">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-100/50 via-purple-100/50 to-transparent" />
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700 mb-4">
                <ShoppingBag className="h-3 w-3" />
                New Arrivals
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-800 mb-4 leading-tight">
                Upgrade Your <br />
                <span className="bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent">
                  Digital Experience
                </span>
              </h2>
              <p className="text-slate-600 max-w-md text-sm sm:text-base leading-relaxed">
                닉네임 변경권부터 한정판 NFT까지. DEL 토큰으로 다양한 아이템을 구매하고 혜택을
                누리세요.
              </p>
            </div>
          </div>

          {/* Categories & Items */}
          <div className="flex flex-col gap-6">
            <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
              <div className="flex items-center justify-between mb-6">
                <TabsList className="h-10 bg-white/90 border border-slate-200 p-1 rounded-xl shadow-sm">
                  {categories.map((cat) => (
                    <TabsTrigger
                      key={cat.id}
                      value={cat.id}
                      className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-600"
                    >
                      {cat.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Filter className="h-3 w-3" />
                  <span>{filteredItems.length} Items</span>
                </div>
              </div>

              <TabsContent value={activeCategory} className="mt-0">
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="h-[280px] rounded-2xl bg-slate-900/50 animate-pulse"
                      />
                    ))}
                  </div>
                ) : filteredItems.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredItems.map((item) => (
                      <ShopItemCard
                        key={item.id}
                        item={item}
                        onPurchase={handlePurchase}
                        disabled={!isConnected}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <ShoppingBag className="h-12 w-12 mb-4 opacity-20" />
                    <p>해당 카테고리에 아이템이 없습니다.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* 닉네임 입력 모달 */}
      <NicknameModal
        isOpen={isNicknameModalOpen}
        onClose={() => {
          setIsNicknameModalOpen(false);
          setPendingNicknameItem(null);
        }}
        onConfirm={handleNicknameConfirm}
        currentNickname={currentNickname}
      />
    </div>
  );
}
