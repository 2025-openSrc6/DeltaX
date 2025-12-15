import { config as loadEnv } from 'dotenv';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// Usage:
//   TARGET=0x... AMOUNT_DEL=5 npm exec tsx scripts/sui-mint-check.ts
// - TARGET: recipient address (0x... hex)
// - AMOUNT_DEL: whole DEL units (default 5 if omitted)
// Example:
//   TARGET=0x1239..123 AMOUNT_DEL=5 npm exec tsx scripts/sui-mint-check.ts

// Load env (local first)
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const DECIMALS = 1_000_000_000;
const DECIMALS_BIG = BigInt(DECIMALS);

function normalizeSponsorKey() {
  const key = process.env.SUI_SPONSOR_PRIVATE_KEY;
  if (!key) {
    throw new Error('SUI_SPONSOR_PRIVATE_KEY is missing');
  }
  if (!/^suiprivkey/i.test(key)) {
    return;
  }
  const decoded = decodeSuiPrivateKey(key);
  if (decoded.schema !== 'ED25519') {
    throw new Error(`Unsupported sponsor key scheme: ${decoded.schema}`);
  }
  process.env.SUI_SPONSOR_PRIVATE_KEY = Buffer.from(decoded.secretKey).toString('base64');
}

function getTargetAddress() {
  const target = process.env.TARGET;
  if (!target) {
    throw new Error('TARGET (recipient address) is required');
  }
  if (!/^0x[0-9a-fA-F]+$/.test(target)) {
    throw new Error('TARGET must be a hex address starting with 0x');
  }
  return target;
}

function getAmountUnits() {
  const amountDel = Number(process.env.AMOUNT_DEL ?? '5');
  if (!Number.isFinite(amountDel) || amountDel <= 0) {
    throw new Error('AMOUNT_DEL must be a positive number (DEL)');
  }
  const amountUnits = amountDel * DECIMALS;
  if (!Number.isSafeInteger(amountUnits)) {
    throw new Error('AMOUNT_DEL is too large after scaling to base units');
  }
  return { amountDel, amountUnits };
}

async function main() {
  normalizeSponsorKey();

  const packageId = process.env.SUI_PACKAGE_ID;
  if (!packageId) throw new Error('SUI_PACKAGE_ID is missing');
  if (!process.env.SUI_TREASURY_CAP_ID) {
    throw new Error('SUI_TREASURY_CAP_ID is missing');
  }

  const target = getTargetAddress();
  const { amountDel, amountUnits } = getAmountUnits();

  // Dynamic import after env normalization
  const { mintDel } = await import('../lib/sui/admin');
  const { suiClient } = await import('../lib/sui/client');

  console.log(`Minting ${amountDel} DEL (${amountUnits} base units) to ${target}...`);
  const { txDigest } = await mintDel(target, amountUnits);
  console.log(`Mint tx digest: ${txDigest}`);

  const coinType = `${packageId}::del::DEL`;
  const balance = await suiClient.getBalance({ owner: target, coinType });
  const raw = BigInt(balance.totalBalance);
  const human = Number(raw) / DECIMALS;

  console.log(`Balance for ${target} (coin: ${coinType})`);
  console.log(`- Raw: ${raw.toString()}`);
  console.log(`- Approx: ${human} DEL`);
}

main().catch((error) => {
  console.error('[sui-mint-check] Failed:', error);
  process.exit(1);
});
