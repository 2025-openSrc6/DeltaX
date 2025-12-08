'use client';

import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

const isUserRejectionError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof Error && /user rejected/i.test(error.message)) return true;
  const code = (error as { code?: string | number }).code;
  return code === 4001 || code === 'USER_REJECTED' || code === 'USER_REJECTED_REQUEST';
};

const queryClientLogger = {
  log: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (error: unknown, ...rest: unknown[]) => {
    if (isUserRejectionError(error)) {
      console.info('사용자가 요청을 취소했습니다.');
      return;
    }
    console.error(error, ...rest);
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  // QueryClient는 상태로 관리하여 매 렌더링마다 새로 생성되지 않도록 함
  const [queryClient] = useState(() =>
    // logger 필드를 타입 강제 없이 주입
    (() => {
      const client = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      });
      (client as { logger?: unknown }).logger = queryClientLogger;
      return client;
    })(),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={{ testnet: { url: getFullnodeUrl('testnet') } }}
        defaultNetwork="testnet"
      >
        <WalletProvider>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
