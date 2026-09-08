import { Connection, PublicKey } from '@solana/web3.js';

/** Cookie Chain endpoints (docs.cookiechain.wtf/developer-guide). */
export const RPC_URL = 'https://rpc.cookiescan.io';
export const WS_URL = 'wss://wss.cookiescan.io';
export const EXPLORER = 'https://cookiescan.io';

/** Genesis-embedded SPL Memo program — the only program CookieBench writes through. */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** Namespace for every measurement this app publishes on-chain. */
export const MEMO_NAMESPACE = 'cookiebench:v1';

/** COOK is lamports-style with 9 decimals (docs.cookiechain.wtf/cook). */
export const COOK_DECIMALS = 9;
export const LAMPORTS_PER_COOK = 1_000_000_000;

/**
 * A single shared Connection. `confirmed` is the default commitment for reads;
 * the benchmark deliberately drives its own commitment polling instead of
 * relying on the built-in confirmation helpers, which hide the timing we measure.
 */
export const connection = new Connection(RPC_URL, {
  commitment: 'confirmed',
  wsEndpoint: WS_URL,
  disableRetryOnRateLimit: false,
});

export interface NetworkPulse {
  slot: number;
  blockHeight: number;
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  transactionCount: number | null;
  solanaCore: string;
  validators: number;
  supplyCook: number;
  blockhash: string;
}

/** One batched read of everything the dashboard shows. Never needs a wallet. */
export async function fetchPulse(): Promise<NetworkPulse> {
  const [epochInfo, version, nodes, supply, latest] = await Promise.all([
    connection.getEpochInfo(),
    connection.getVersion(),
    connection.getClusterNodes(),
    connection.getSupply({ excludeNonCirculatingAccountsList: true }),
    connection.getLatestBlockhash(),
  ]);

  return {
    slot: epochInfo.absoluteSlot,
    blockHeight: epochInfo.blockHeight ?? 0,
    epoch: epochInfo.epoch,
    slotIndex: epochInfo.slotIndex,
    slotsInEpoch: epochInfo.slotsInEpoch,
    transactionCount: epochInfo.transactionCount ?? null,
    solanaCore: version['solana-core'] ?? 'unknown',
    validators: nodes.length,
    supplyCook: supply.value.total / LAMPORTS_PER_COOK,
    blockhash: latest.blockhash,
  };
}

/** Measured slot cadence — the ground truth behind the "~1s block time" claim. */
export async function measureSlotTime(samples = 3, gapMs = 2000): Promise<number | null> {
  const points: Array<{ slot: number; at: number }> = [];
  for (let i = 0; i < samples; i += 1) {
    points.push({ slot: await connection.getSlot('confirmed'), at: performance.now() });
    if (i < samples - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  const slots = last.slot - first.slot;
  if (slots <= 0) return null;
  return (last.at - first.at) / slots;
}

export const explorerTx = (sig: string) => `${EXPLORER}/tx/${sig}`;
export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;

export interface CommitmentLag {
  /** Slots the finalized head trails the confirmed head — the consensus depth. */
  slotGap: number;
  /** Wall-clock time for one slot to travel from confirmed to finalized. */
  lagMs: number;
  targetSlot: number;
}

/**
 * Measures real commitment latency with no wallet and no funds.
 *
 * Takes the current confirmed head, then waits for the finalized head to reach it.
 * This is why CookieBench can show measured finality to every visitor rather than
 * only to someone holding COOK.
 */
export async function measureCommitmentLag(
  timeoutMs = 60_000,
  pollMs = 250,
): Promise<CommitmentLag | null> {
  const targetSlot = await connection.getSlot('confirmed');
  const startedAt = performance.now();
  const deadline = startedAt + timeoutMs;
  const startFinalized = await connection.getSlot('finalized');

  while (performance.now() < deadline) {
    const finalized = await connection.getSlot('finalized').catch(() => null);
    if (finalized !== null && finalized >= targetSlot) {
      return {
        slotGap: targetSlot - startFinalized,
        lagMs: performance.now() - startedAt,
        targetSlot,
      };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}
