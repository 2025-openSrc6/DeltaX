'use client';

import { useState, useEffect } from 'react';
import {
  useCurrentWallet,
  useSignPersonalMessage,
  useSignTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { ConnectButton } from '@mysten/dapp-kit';
import { toBase64 } from '@mysten/sui/utils';
import type { CoinStruct } from '@mysten/sui/client';

// 1 DEL = 10^9 MIST
const MIST_PER_DEL = 1_000_000_000;
const SUISCAN_NETWORK = 'testnet';

function getSuiscanTxUrl(digest: string) {
  return `https://suiscan.xyz/${SUISCAN_NETWORK}/tx/${digest}`;
}

export default function DevDemoPage() {
  const { currentWallet, isConnected } = useCurrentWallet();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const suiClient = useSuiClient();

  // ----- Auth Logic (Mirrored from app/page.tsx) -----
  const [user, setUser] = useState<{
    id: string;
    nickname: string | null;
    suiAddress: string;
  } | null>(null);

  const refresh = () => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.user) {
          setUser(data.data.user);
        } else {
          setUser(null);
        }
      })
      .catch((e) => console.error('Session check failed', e));
  };

  // Check Session on Mount
  useEffect(() => {
    refresh();
  }, []);

  const buildLoginMessage = (nonce: string, expMs: number) => {
    const domain = typeof window !== 'undefined' ? window.location.host : 'deltax.app';
    return `DeltaX Login\nDomain: ${domain}\nNonce: ${nonce}\nExp: ${expMs}`;
  };

  const handleLogin = async () => {
    if (!currentWallet?.accounts[0]?.address) return;
    const address = currentWallet.accounts[0].address;

    try {
      const nonce = crypto.randomUUID();
      const expMs = Date.now() + 5 * 60_000; // 5 min
      const message = buildLoginMessage(nonce, expMs);
      const encoder = new TextEncoder();

      const signed = await signPersonalMessage({
        message: encoder.encode(message),
      });

      // Handle simplified signature/bytes logic
      const signature = signed.signature;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawBytes = (signed as any).bytes || signed.signature; // DappKit variation
      let signedMessageBytes: string;

      if (typeof rawBytes === 'string') {
        signedMessageBytes = rawBytes;
      } else {
        // Uint8Array → base64
        signedMessageBytes = btoa(
          String.fromCharCode.apply(null, Array.from(rawBytes as Uint8Array)),
        );
      }

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ suiAddress: address, signature, message, signedMessageBytes }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Login failed');
      }

      setUser(data.data.user);
      refresh(); // Refresh page data
    } catch (e) {
      alert('Login Failed: ' + (e as Error).message);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
  };

  // Use user state for isLoggedIn check
  const isLoggedIn = !!user;

  // ----- State -----
  const [cronSecret, setCronSecret] = useState('');
  const [mintAmount, setMintAmount] = useState(100);
  const [mintStatus, setMintStatus] = useState('');

  // Round Control
  const [roundId, setRoundId] = useState(''); // Target Round ID
  const [roundType, setRoundType] = useState<'DEMO_3MIN' | '1MIN' | '6HOUR' | '1DAY'>('DEMO_3MIN');
  const [roundStatusLog, setRoundStatusLog] = useState<string[]>([]);
  const [roundOptions, setRoundOptions] = useState<
    Array<{
      id: string;
      roundNumber: number;
      status: string;
      startTime: number;
      lockTime: number;
      endTime: number;
    }>
  >([]);
  const [isFetchingRounds, setIsFetchingRounds] = useState(false);
  const [roundFetchError, setRoundFetchError] = useState<string>('');

  // Bet Control
  const [betAmount, setBetAmount] = useState(100);
  const [prediction, setPrediction] = useState<'GOLD' | 'BTC'>('GOLD');
  const [userDelCoinId, setUserDelCoinId] = useState('');
  const [lastBetId, setLastBetId] = useState('');
  const [lastBetTxDigest, setLastBetTxDigest] = useState('');
  const [lastClaimTxDigest, setLastClaimTxDigest] = useState('');
  const [betLog, setBetLog] = useState<string[]>([]);

  // Claim Control
  const [claimBetId, setClaimBetId] = useState('');
  const [claimLog, setClaimLog] = useState<string[]>([]);

  // ----- Helpers -----
  const logRound = (msg: string) =>
    setRoundStatusLog((prev) => [new Date().toISOString().split('T')[1] + ' ' + msg, ...prev]);
  const logBet = (msg: string) =>
    setBetLog((prev) => [new Date().toISOString().split('T')[1] + ' ' + msg, ...prev]);
  const logClaim = (msg: string) =>
    setClaimLog((prev) => [new Date().toISOString().split('T')[1] + ' ' + msg, ...prev]);

  // ----- Actions: Mint -----
  const handleMint = async () => {
    if (!currentWallet) return;
    setMintStatus('Minting...');
    try {
      const res = await fetch('/api/test/mint', {
        method: 'POST',
        body: JSON.stringify({
          address: currentWallet.accounts[0].address,
          amount: Number(mintAmount),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMintStatus(`Success! tx: ${data.data.txDigest}`);
        logBet('Minted ' + mintAmount + ' DEL');
      } else {
        setMintStatus('Failed: ' + data.error?.message);
      }
    } catch (e) {
      setMintStatus('Error: ' + (e as Error).message);
    }
  };

  // ----- Actions: Round Lifecycle -----
  const fetchRounds = async () => {
    setIsFetchingRounds(true);
    setRoundFetchError('');
    try {
      const params = new URLSearchParams({
        type: roundType,
        page: '1',
        pageSize: '20',
        sort: 'start_time',
        order: 'desc',
      });
      const res = await fetch(`/api/rounds?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message || 'Failed to fetch rounds');
      }
      const rounds = (json?.data?.rounds ?? []) as Array<{
        id: string;
        roundNumber: number;
        status: string;
        startTime: number;
        lockTime: number;
        endTime: number;
      }>;
      setRoundOptions(rounds);

      // Auto-select latest round if empty or no longer in list
      if (rounds.length > 0) {
        const latestId = rounds[0].id;
        const isCurrentValid = !!roundId && rounds.some((r) => r.id === roundId);
        if (!isCurrentValid) {
          setRoundId(latestId);
          logRound(`Auto-selected latest roundId: ${latestId}`);
        }
      }
    } catch (e) {
      setRoundFetchError((e as Error).message);
    } finally {
      setIsFetchingRounds(false);
    }
  };

  // Fetch rounds on mount + when type changes
  useEffect(() => {
    fetchRounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundType]);

  const callCron = async (action: 'create' | 'open' | 'lock' | 'finalize') => {
    logRound(`Starting ${action}...`);
    try {
      let url = '/api/cron/rounds/' + action;
      const method = 'POST';
      let body: unknown = undefined;

      // Special case for Create: Use Admin API for DEMO_3MIN
      if (action === 'create') {
        url = '/api/rounds'; // Admin API
        body = {
          type: roundType,
          startTime: Date.now() + 20000, // Start in 20s
        };
      } else {
        // Cron jobs
        if (!cronSecret) {
          logRound('Error: Cron Secret required for jobs');
          return;
        }
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cronSecret) headers['X-Cron-Secret'] = cronSecret;

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Unknown Error');

      logRound(`Success ${action}: ${JSON.stringify(data.data)}`);

      // Auto-set roundId if created
      if (action === 'create' && data.data.round?.id) {
        setRoundId(data.data.round.id);
        logRound(`Configured Round ID: ${data.data.round.id}`);
      }

      // Refresh rounds dropdown after successful action
      fetchRounds();
    } catch (e) {
      logRound(`Failed ${action}: ` + (e as Error).message);
    }
  };

  // ----- Actions: Betting Flow -----
  const [availableCoins, setAvailableCoins] = useState<{ id: string; balance: number }[]>([]);
  const [isFetchingCoins, setIsFetchingCoins] = useState(false);
  const [suiPackageId, setSuiPackageId] = useState<string>('');

  useEffect(() => {
    fetch('/api/public-config')
      .then((res) => res.json())
      .then((data) => {
        if (data.suiPackageId) setSuiPackageId(data.suiPackageId);
        if (data.cronSecret) setCronSecret(data.cronSecret);
      })
      .catch(console.error);
  }, []);

  const fetchUserCoins = async () => {
    if (!currentWallet?.accounts[0]?.address) return;
    if (!suiPackageId) {
      alert('SUI_PACKAGE_ID not loaded yet. Please wait or refresh.');
      return;
    }

    setIsFetchingCoins(true);
    const targetCoinType = `${suiPackageId}::del::DEL`;
    console.log(`DEBUG: Fetching coins of type ${targetCoinType}`);

    try {
      let hasNextPage = true;
      let cursor: string | null | undefined = null;
      let allCoins: CoinStruct[] = [];

      // Fetch all pages
      while (hasNextPage) {
        const res = await suiClient.getCoins({
          owner: currentWallet.accounts[0].address,
          cursor,
          limit: 50,
          coinType: targetCoinType, // Explicitly request DEL coins
        });
        allCoins = [...allCoins, ...res.data];
        hasNextPage = res.hasNextPage;
        cursor = res.nextCursor;
      }

      console.log(`DEBUG: Fetched ${allCoins.length} DEL coins directly.`);

      const delCoins = allCoins.map((coin) => ({
        id: coin.coinObjectId,
        balance: Number(coin.balance) / MIST_PER_DEL,
        type: coin.coinType,
      }));

      if (delCoins.length === 0) {
        console.warn('DEBUG: No DEL coins found. Check if you minted DEL.');
      }

      setAvailableCoins(delCoins);
      if (delCoins.length > 0) {
        if (!userDelCoinId || !delCoins.find((c) => c.id === userDelCoinId)) {
          setUserDelCoinId(delCoins[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch coins', e);
    } finally {
      setIsFetchingCoins(false);
    }
  };

  // ... (rest unrelated)

  // In HTML:
  /*
                <label className="text-xs text-zinc-500 uppercase flex justify-between mb-1">
                  <span>DEL Coin Object ID</span>
                  <button
                    onClick={fetchUserCoins}
                    disabled={isFetchingCoins}
                    className="text-blue-500 hover:text-blue-400 underline cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                  >
                    {isFetchingCoins ? '⏳ Loading...' : '🔄 Refresh'}
                  </button>
                </label>
  */

  const handleBetPrepare = async () => {
    logBet('Preparing bet...');
    try {
      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId,
          prediction,
          amount: Number(betAmount),
          userDelCoinId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message);

      const { betId, txBytes, nonce } = data.data;
      logBet(`Prepared! BetID: ${betId}, Nonce: ${nonce}`);
      setLastBetId(betId);
      setClaimBetId(betId);

      // Sign
      logBet('Requesting signature...');
      const signed = await signTransaction({
        transaction: Transaction.from(
          typeof txBytes === 'string' ? propsBytesToUint8Array(txBytes) : txBytes,
        ),
        account: currentWallet!.accounts[0],
        chain: 'sui:testnet',
      });

      logBet('Signed! Executing...');

      // Execute
      const execRes = await fetch('/api/bets/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betId,
          txBytes: typeof txBytes === 'string' ? txBytes : toBase64(txBytes),
          userSignature: signed.signature,
          nonce,
        }),
      });
      const execData = await execRes.json();
      if (!execRes.ok) throw new Error(execData.error?.message);

      const digest = execData.data.digest as string;
      setLastBetTxDigest(digest);
      logBet(`Executed! Digest: ${digest}`);
    } catch (e) {
      logBet('Error: ' + (e as Error).message);
    }
  };

  // ----- Actions: Claim Flow -----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [myBets, setMyBets] = useState<any[]>([]);

  const fetchMyBets = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/bets?userId=${user.id}&pageSize=5`);
      const data = await res.json();
      if (data.success) {
        setMyBets(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch my bets', e);
    }
  };

  useEffect(() => {
    if (user?.id) fetchMyBets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleClaim = async () => {
    logClaim(`Claiming Bet ${claimBetId}...`);
    try {
      // Prepare
      const res = await fetch('/api/bets/claim/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ betId: claimBetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message);

      const { txBytes, nonce } = data.data;
      logClaim(`Prepared! Nonce: ${nonce}`);

      // Sign
      const signed = await signTransaction({
        transaction: Transaction.from(propsBytesToUint8Array(txBytes)),
        account: currentWallet!.accounts[0],
        chain: 'sui:testnet',
      });

      // Execute
      const execRes = await fetch('/api/bets/claim/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betId: claimBetId,
          txBytes, // Keep as base64 string from server
          userSignature: signed.signature,
          nonce,
        }),
      });
      const execData = await execRes.json();
      if (!execRes.ok) throw new Error(execData.error?.message);

      const digest = execData.data.digest as string;
      setLastClaimTxDigest(digest);
      logClaim(
        `Claimed! Payout: ${execData.data.payoutAmount / MIST_PER_DEL} DEL, Digest: ${digest}`,
      );
      fetchMyBets(); // Refresh list
    } catch (e) {
      logClaim('Error: ' + (e as Error).message);
    }
  };

  // Helper because checking types is annoying
  function propsBytesToUint8Array(bytes: string | Uint8Array): Uint8Array {
    if (typeof bytes === 'string') return Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0));
    return bytes;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-mono">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex justify-between items-center border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              DeltaX Dev Console
            </h1>
            <p className="text-zinc-400 text-sm mt-1">End-to-End Betting Flow Verification</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Wallet Connect Button Wrapper for Dark Mode */}
            <div className="[&_button]:!bg-zinc-800 [&_button]:!text-white [&_button]:!font-mono hover:[&_button]:!bg-zinc-700">
              <ConnectButton />
            </div>
          </div>
        </header>

        {/* 1. Auth Status */}
        <section className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/50 backdrop-blur">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">
            1. Authentication
          </h2>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              {isLoggedIn ? (
                <>
                  <div className="text-green-400 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Session Active
                  </div>
                  <div className="text-zinc-400 text-sm">User: {user?.nickname || 'Unknown'}</div>
                  <div className="text-zinc-500 text-xs font-mono">{user?.suiAddress}</div>
                </>
              ) : (
                <>
                  <div className="text-red-400 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                    Session Inactive
                  </div>
                  <div className="text-zinc-500 text-sm">Please login to interact with API</div>
                </>
              )}
            </div>
            <div>
              {isLoggedIn ? (
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 border border-zinc-600 hover:bg-zinc-800 rounded text-sm transition-colors"
                >
                  Logout
                </button>
              ) : (
                <button
                  onClick={handleLogin}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Login with Wallet
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 2. Environment Setup */}
        <section className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/50">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">
            2. Environment Setup
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 uppercase">Cron Secret (Admin)</label>
              <input
                type="password"
                value={cronSecret}
                onChange={(e) => setCronSecret(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="Enter CRON_SECRET..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 uppercase">Test Faucet</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(Number(e.target.value))}
                  className="w-32 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={handleMint}
                  disabled={!currentWallet}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded px-3 text-sm disabled:opacity-50 border border-zinc-700"
                >
                  Mint DEL
                </button>
              </div>
              <div className="text-xs text-zinc-500 h-4">{mintStatus}</div>
            </div>
          </div>
        </section>

        {/* 3. Round Control */}
        <section className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/50">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">
            3. Round Lifecycle (DEMO_3MIN)
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <button
              onClick={() => callCron('create')}
              className="bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700 text-purple-200 px-3 py-3 rounded text-sm transition-all text-left"
            >
              <div className="font-bold">1. Create</div>
              <div className="text-xs opacity-70">Admin API</div>
            </button>
            <button
              onClick={() => callCron('open')}
              className="bg-blue-900/30 hover:bg-blue-900/50 border border-blue-700 text-blue-200 px-3 py-3 rounded text-sm transition-all text-left"
            >
              <div className="font-bold">2. Open</div>
              <div className="text-xs opacity-70">Job 2 (Scheduler)</div>
            </button>
            <button
              onClick={() => callCron('lock')}
              className="bg-orange-900/30 hover:bg-orange-900/50 border border-orange-700 text-orange-200 px-3 py-3 rounded text-sm transition-all text-left"
            >
              <div className="font-bold">3. Lock</div>
              <div className="text-xs opacity-70">Job 3 (1min)</div>
            </button>
            <button
              onClick={() => callCron('finalize')}
              className="bg-red-900/30 hover:bg-red-900/50 border border-red-700 text-red-200 px-3 py-3 rounded text-sm transition-all text-left"
            >
              <div className="font-bold">4. Finalize</div>
              <div className="text-xs opacity-70">Job 4 (3min)</div>
            </button>
          </div>

          <div className="bg-black border border-zinc-800 rounded p-3 h-40 overflow-y-auto font-mono text-xs text-zinc-300 shadow-inner">
            {roundStatusLog.length === 0 && (
              <span className="text-zinc-700 select-none">Waiting for actions...</span>
            )}
            {roundStatusLog.map((l, i) => (
              <div key={i} className="border-b border-zinc-900/50 pb-1 mb-1 last:border-0">
                {l}
              </div>
            ))}
          </div>
        </section>

        {/* 4. Betting */}
        <section className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/50">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">
            4. Place Bet
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 uppercase block mb-1">
                  Target Round ID (Latest auto-selected)
                </label>
                <div className="flex gap-2">
                  <select
                    value={roundId}
                    onChange={(e) => setRoundId(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-yellow-500 focus:border-yellow-500 focus:outline-none"
                    disabled={isFetchingRounds}
                  >
                    {roundOptions.length === 0 && <option value="">(No rounds)</option>}
                    {roundOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        #{r.roundNumber} · {r.status} · {new Date(r.startTime).toLocaleTimeString()}{' '}
                        · {r.id.slice(0, 8)}...
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={fetchRounds}
                    disabled={isFetchingRounds}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs border border-zinc-700 disabled:opacity-50"
                  >
                    {isFetchingRounds ? '⏳' : '🔄'}
                  </button>
                </div>
                {roundFetchError && (
                  <div className="mt-2 text-xs text-red-400">
                    Rounds fetch error: {roundFetchError}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-zinc-500 uppercase flex justify-between mb-1">
                  <span>DEL Coin Object ID</span>
                  <button
                    onClick={fetchUserCoins}
                    disabled={isFetchingCoins}
                    className="text-blue-500 hover:text-blue-400 underline cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                  >
                    {isFetchingCoins ? '⏳ Loading...' : '🔄 Refresh'}
                  </button>
                </label>
                {availableCoins.length > 0 ? (
                  <select
                    value={userDelCoinId}
                    onChange={(e) => setUserDelCoinId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs font-mono focus:border-blue-500 focus:outline-none text-white"
                  >
                    {availableCoins.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.balance} DEL ({c.id.slice(0, 6)}...{c.id.slice(-4)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={userDelCoinId}
                    onChange={(e) => setUserDelCoinId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs font-mono focus:border-blue-500 focus:outline-none"
                    placeholder="Click Refresh or Paste ID..."
                  />
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 uppercase block mb-1">Prediction</label>
                  <select
                    value={prediction}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setPrediction(e.target.value as 'GOLD' | 'BTC')
                    }
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="GOLD">GOLD</option>
                    <option value="BTC">BTC</option>
                  </select>
                </div>
                <div className="w-32">
                  <label className="text-xs text-zinc-500 uppercase block mb-1">Amount</label>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleBetPrepare}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded shadow-lg shadow-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                disabled={!isLoggedIn || !roundId || !userDelCoinId}
              >
                Execute Bet Transaction
              </button>

              {/* Latest Bet Tx -> SuiScan */}
              {lastBetTxDigest && (
                <a
                  href={getSuiscanTxUrl(lastBetTxDigest)}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-cyan-300 hover:text-cyan-200 underline break-all"
                >
                  🔎 Open Bet Tx in SuiScan: {lastBetTxDigest}
                </a>
              )}
            </div>
          </div>

          <div className="bg-black border border-zinc-800 rounded p-3 h-40 overflow-y-auto font-mono text-xs text-zinc-300 shadow-inner">
            {betLog.length === 0 && (
              <span className="text-zinc-700 select-none">No bets placed yet...</span>
            )}
            {betLog.map((l, i) => (
              <div
                key={i}
                className="border-b border-zinc-900/50 pb-1 mb-1 last:border-0 break-all"
              >
                {l}
              </div>
            ))}
          </div>
        </section>

        {/* 5. Claim */}
        <section className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/50">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">
            5. Claim Payout
          </h2>
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs text-zinc-500 uppercase">My Last 5 Bets</h3>
              <button onClick={fetchMyBets} className="text-xs text-blue-500 hover:text-blue-400">
                🔄 Refresh List
              </button>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-900/50 text-zinc-500">
                  <tr>
                    <th className="p-2">Bet ID</th>
                    <th className="p-2">Amount</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Result</th>
                    <th className="p-2">Tx</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myBets.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-zinc-600">
                        No bets found
                      </td>
                    </tr>
                  )}
                  {myBets.map((bet) => (
                    <tr key={bet.id} className="border-t border-zinc-900 hover:bg-zinc-900/30">
                      <td className="p-2 font-mono text-zinc-400" title={bet.id}>
                        {bet.id.slice(0, 8)}...
                      </td>
                      <td className="p-2">{bet.amount / MIST_PER_DEL} DEL</td>
                      <td className="p-2">{bet.chainStatus}</td>
                      <td className="p-2">{bet.resultStatus}</td>
                      <td className="p-2">
                        {bet.suiTxHash ? (
                          <a
                            href={getSuiscanTxUrl(bet.suiTxHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 hover:text-cyan-200 underline"
                            title={bet.suiTxHash}
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => setClaimBetId(bet.id)}
                          className="text-blue-500 hover:underline disabled:opacity-50 disabled:no-underline"
                          disabled={bet.chainStatus !== 'EXECUTED'}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-4 items-end mb-4">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 uppercase block mb-1">Target Bet ID</label>
              <input
                type="text"
                value={claimBetId}
                onChange={(e) => setClaimBetId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-green-500 focus:border-green-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleClaim}
              className="px-6 py-2 bg-green-700 hover:bg-green-600 text-white font-bold rounded shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all h-[38px]"
              disabled={!isLoggedIn || !claimBetId}
            >
              Claim Payout
            </button>
          </div>

          {/* Latest Claim Tx -> SuiScan */}
          {lastClaimTxDigest && (
            <a
              href={getSuiscanTxUrl(lastClaimTxDigest)}
              target="_blank"
              rel="noreferrer"
              className="block mb-3 text-xs text-green-300 hover:text-green-200 underline break-all"
            >
              🔎 Open Claim Tx in SuiScan: {lastClaimTxDigest}
            </a>
          )}
          <div className="bg-black border border-zinc-800 rounded p-3 h-32 overflow-y-auto font-mono text-xs text-zinc-300 shadow-inner">
            {claimLog.length === 0 && (
              <span className="text-zinc-700 select-none">Waiting for claims...</span>
            )}
            {claimLog.map((l, i) => (
              <div
                key={i}
                className="border-b border-zinc-900/50 pb-1 mb-1 last:border-0 break-all"
              >
                {l}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
