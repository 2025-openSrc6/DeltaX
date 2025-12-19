import { formatAddress } from '@mysten/sui/utils';

// BigInt JSON 직렬화 문제 해결
export const toJSON = (obj: unknown) => {
  return JSON.parse(
    JSON.stringify(obj, (key, value) => (typeof value === 'bigint' ? value.toString() : value)),
  );
};

// 잠시 대기 (Polling용)
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 주소 정규화 (0x123... -> 0x0...123)
export const normalize = (addr: string) => formatAddress(addr);
