import { config as loadEnv } from 'dotenv';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { suiClient } from '@/lib/sui/client';

// Usage:
//   OWNER=0x... npm exec tsx scripts/sui-list-del-coins.ts
//
// Output:
//   - coinType
//   - coinObjectId list (use one as userDelCoinId for POST /api/bets)

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

function normalizeSponsorKey() {
  // lib/sui/client.ts expects base64 secret key bytes.
  // Allow local dev to paste `suiprivkey...` and normalize to base64.
  const key = process.env.SUI_SPONSOR_PRIVATE_KEY;
  if (!key) return;
  if (!/^suiprivkey/i.test(key)) return;
  const decoded = decodeSuiPrivateKey(key);
  if (decoded.schema !== 'ED25519') {
    throw new Error(`Unsupported sponsor key scheme: ${decoded.schema}`);
  }
  process.env.SUI_SPONSOR_PRIVATE_KEY = Buffer.from(decoded.secretKey).toString('base64');
}

function getOwnerAddress() {
  const owner = process.env.OWNER;
  if (!owner) throw new Error('OWNER is required (0x...)');
  if (!/^0x[0-9a-fA-F]+$/.test(owner))
    throw new Error('OWNER must be a hex address starting with 0x');
  return owner;
}

async function main() {
  normalizeSponsorKey();

  const packageId = process.env.SUI_PACKAGE_ID;
  if (!packageId) throw new Error('SUI_PACKAGE_ID is missing');

  const owner = getOwnerAddress();
  const coinType = `${packageId}::del::DEL`;

  const coins = await suiClient.getCoins({ owner, coinType, limit: 50 });

  console.log(`Owner: ${owner}`);
  console.log(`CoinType: ${coinType}`);
  console.log(`Count: ${coins.data.length}`);
  if (coins.data.length === 0) {
    console.log('No DEL coins found. Mint DEL first (see scripts/sui-mint-check.ts).');
    return;
  }
  for (const c of coins.data) {
    console.log(`- coinObjectId=${c.coinObjectId} balance=${c.balance} version=${c.version}`);
  }
}

main().catch((error) => {
  console.error('[sui-list-del-coins] Failed:', error);
  process.exit(1);
});
