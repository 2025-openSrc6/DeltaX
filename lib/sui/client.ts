import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// 환경 변수
const RPC_URL = process.env.SUI_RPC_URL;
const SPONSOR_KEY = process.env.SUI_SPONSOR_PRIVATE_KEY;
export const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID || '0x0';
export const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet') as
  | 'testnet'
  | 'mainnet'
  | 'devnet'
  | 'localnet';

// RPC 클라이언트 (커스텀 URL 또는 기본 URL 사용)
export const suiClient = new SuiClient({
  url: RPC_URL || getFullnodeUrl(SUI_NETWORK),
});

/**
 * 스폰서 키페어 로드
 * 환경변수 SUI_SPONSOR_PRIVATE_KEY에서 Bech32 또는 Base64 인코딩된 비밀키를 읽어 키페어 생성
 */
export function getSponsorKeypair(): Ed25519Keypair {
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
