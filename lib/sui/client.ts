import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
const SPONSOR_KEY = process.env.SUI_SPONSOR_PRIVATE_KEY!;

// RPC 클라이언트 (타임아웃 설정 추천)
export const suiClient = new SuiClient({
  url: RPC_URL,
  // timeout: 10000,
});

import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// 스폰서 키페어 로드
export function getSponsorKeypair() {
  if (!SPONSOR_KEY) {
    console.error(
      'DEBUG: SUI_SPONSOR_PRIVATE_KEY is missing. Env keys:',
      Object.keys(process.env).filter((k) => k.startsWith('SUI')),
    );
    throw new Error('SUI_SPONSOR_PRIVATE_KEY missing');
  }

  // Case A: Bech32 format (suiprivkey...)
  if (SPONSOR_KEY.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(SPONSOR_KEY);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  // Case B: Base64 format (Legacy)
  const raw = Buffer.from(SPONSOR_KEY, 'base64');
  // keytool export output sometimes has a 1-byte flag prefix for scheme (33 bytes total for Ed25519)
  // standard Ed25519 secret key is 32 bytes.
  const secretKey = raw.length === 33 ? raw.slice(1) : raw;
  return Ed25519Keypair.fromSecretKey(secretKey);
}
