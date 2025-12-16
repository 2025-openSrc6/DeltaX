import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = {
    suiPackageId: process.env.SUI_PACKAGE_ID || '',
    suiRpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
    // Only expose CRON_SECRET in development for demo purposes
    cronSecret: process.env.NODE_ENV === 'development' ? process.env.CRON_SECRET : undefined,
  };
  return NextResponse.json(config);
}
