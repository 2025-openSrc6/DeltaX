import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
const SPONSOR_KEY = process.env.SUI_SPONSOR_PRIVATE_KEY!;

// RPC 클라이언트 (타임아웃 설정 추천)
export const suiClient = new SuiClient({
  url: RPC_URL,
  // timeout: 10000,
});

// 스폰서 키페어 로드
export function getSponsorKeypair() {
  if (!SPONSOR_KEY) throw new Error('SUI_SPONSOR_PRIVATE_KEY missing');
  const raw = Buffer.from(SPONSOR_KEY, 'base64');
  // 주의: keytool 포맷에 따라 첫 1바이트가 flag일 수 있음. (길이 33이면 slice(1))
  const secretKey = raw.length === 33 ? raw.slice(1) : raw;
  return Ed25519Keypair.fromSecretKey(secretKey);
}
