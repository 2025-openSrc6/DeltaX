# Implementation Plan: Sui Backend Integration

This document outlines the step-by-step plan to implement the **Sponsored Transaction + User Signature** flow.
It is designed for you to copy-paste and implement file by file.

## Goal

Enable users to place bets using their own `DEL` coins, with gas fees paid by the server (Sponsor), handling concurrency via the "Split Gas" strategy.

## Phase 1: Environment & Tools Setup

### 1. Dependencies

Ensure you have the Sui SDK installed.

```bash
npm install @mysten/sui.js
```

### 2. Environment Variables (.env.local)

Add these keys. **DO NOT COMMIT THIS FILE.**

```bash
# Sui Network
SUI_RPC_URL="https://fullnode.testnet.sui.io:443"
SUI_PACKAGE_ID="<YOUR_DEPLOYED_PACKAGE_ID>"

# Sponsor Wallet (The one paying for gas)
# Generate one via `sui keytool generate ed25519` and copy the private key (base64)
SUI_SPONSOR_PRIVATE_KEY="<BASE64_PRIVATE_KEY>"
```

### 3. File Structure

We will create a dedicated module at `lib/sui/`.

```
lib/sui/
├── index.ts          # Public exports
├── config.ts         # Env loader & validation
├── client.ts         # Singleton SuiClient & Signer
├── gas.ts            # (Strategic) Split Gas logic
├── builder.ts        # (Core) PTB Construction
└── service.ts        # (Business) The high-level API handler
```

---

## Phase 2: Implementation Steps

### Step 1: `config.ts` (Safety First)

Create a centralized place to load config. Fail fast if keys are missing.

<details>
<summary>Click to see pseudo-code</summary>

```typescript
// lib/sui/config.ts
export const SUI_CONFIG = {
  rpcUrl: process.env.SUI_RPC_URL!,
  packageId: process.env.SUI_PACKAGE_ID!,
  sponsorPrivateKey: process.env.SUI_SPONSOR_PRIVATE_KEY!,
};

if (!SUI_CONFIG.sponsorPrivateKey) {
  throw new Error('Missing SUI_SPONSOR_PRIVATE_KEY');
}
```

</details>

### Step 2: `client.ts` (The Connection)

Setup the `SuiClient` and the `Keypair` for the sponsor.

<details>
<summary>Click to see pseudo-code</summary>

```typescript
// lib/sui/client.ts
import { SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SUI_CONFIG } from './config';

export const suiClient = new SuiClient({ url: SUI_CONFIG.rpcUrl });

// Decode the private key carefully
export function getSponsorKeypair() {
  const raw = Buffer.from(SUI_CONFIG.sponsorPrivateKey, 'base64');
  return Ed25519Keypair.fromSecretKey(raw.slice(1)); // Note: keytool output often has a 1-byte flag prefix! Check documentation.
}
```

</details>

### Step 3: `gas.ts` (The "Split Gas" Trick)

**Crucial for reliability.** Instead of using the whole 100 SUI coin, pick a random small coin.

<details>
<summary>Click to see pseudo-code</summary>

```typescript
// lib/sui/gas.ts
import { suiClient } from './client';

export async function getGasParams(sponsorAddress: string) {
  // 1. Fetch all coins owned by sponsor
  const coins = await suiClient.getCoins({ owner: sponsorAddress });

  // 2. Filter for coins that have at least 0.05 SUI (enough for gas)
  const validCoins = coins.data.filter((c) => parseInt(c.balance) > 50_000_000);

  if (validCoins.length === 0) throw new Error('Sponsor has no gas!');

  // 3. RANDOM PICK (The "Split Gas" Strategy)
  const randomCoin = validCoins[Math.floor(Math.random() * validCoins.length)];

  return {
    gasPayment: [
      { objectId: randomCoin.coinObjectId, version: randomCoin.version, digest: randomCoin.digest },
    ],
    gasBudget: 50_000_000, // 0.05 SUI (Adjust based on network)
    gasPrice: 1000, // Reference gas price
  };
}
```

</details>

### Step 4: `builder.ts` (The "Contract")

Construct the **Programmable Transaction Block (PTB)**. This is where you call `place_bet`.

<details>
<summary>Click to see pseudo-code</summary>

```typescript
// lib/sui/builder.ts
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SUI_CONFIG } from './config';

interface BetParams {
  userAddress: string;
  poolId: string;
  coinId: string; // The user's DEL coin to retry
  prediction: number; // 1 or 2
}

export async function buildPlaceBetTx({ userAddress, poolId, coinId, prediction }: BetParams) {
  const tx = new TransactionBlock();

  // 1. Set Sender (User)
  tx.setSender(userAddress);

  // 2. Move Call
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::betting::place_bet`,
    arguments: [
      tx.object(poolId),
      tx.pure(userAddress), // user arg
      tx.pure(prediction),
      tx.object(coinId), // User's DEL coin
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}
```

</details>

### Step 5: `service.ts` (The API Logic)

Combine everything. This is what your `app/api/...` route will call.

<details>
<summary>Click to see pseudo-code</summary>

```typescript
// lib/sui/service.ts
import { getGasParams } from './gas';
import { buildPlaceBetTx } from './builder';
import { suiClient, getSponsorKeypair } from './client';

export async function prepareBetTransaction(params: BetParams) {
  const sponsor = getSponsorKeypair();

  // 1. Build basic logic
  const tx = await buildPlaceBetTx(params);

  // 2. Add Gas (Sponsor pays)
  const gasParams = await getGasParams(sponsor.toSuiAddress());
  tx.setGasPayment(gasParams.gasPayment);
  tx.setGasBudget(gasParams.gasBudget);
  tx.setGasOwner(sponsor.toSuiAddress());

  // 3. Serialize
  const txBytes = await tx.build({ client: suiClient });

  // 4. Return to frontend
  return {
    txBytes: Buffer.from(txBytes).toString('base64'),
    // Can generate a nonce here if needed for strict replay protection
  };
}

export async function executeBetTransaction(txBytesBase64: string, userSignature: string) {
  const sponsor = getSponsorKeypair();
  const txBytes = Buffer.from(txBytesBase64, 'base64');

  // 1. Sponsor Sign
  const sponsorSig = await sponsor.signTransactionBlock(txBytes);

  // 2. Execute
  const res = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [userSignature, sponsorSig.signature],
    options: { showEffects: true },
  });

  return res;
}
```

</details>

---

## Phase 3: Actionable Next Steps

1.  **Create the directory**: `mkdir -p lib/sui`
2.  **Implement `config.ts` & `client.ts`**: Verify you can load the keypair.
3.  **Implement `gas.ts`**: Verify you can see your testnet coins. (Manually send yourself some SUI from faucet and split them if needed).
4.  **Implement `service.ts`**: Connect this to your Next.js API route.
