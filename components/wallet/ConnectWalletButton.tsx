'use client';

import { ConnectButton } from '@mysten/dapp-kit';

export function ConnectWalletButton() {
  return (
    <div className="flex items-center gap-4">
      <ConnectButton className="!bg-amber-500 !text-white !font-bold !px-4 !py-2 !rounded-lg hover:!bg-amber-600 transition-colors" />
    </div>
  );
}
