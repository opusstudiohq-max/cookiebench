import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  type SignatureStatus,
} from '@solana/web3.js';
import { connection, MEMO_PROGRAM_ID, MEMO_NAMESPACE } from './chain';

export type Phase =
  | 'idle'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'processed'
  | 'confirmed'
  | 'finalized'
  | 'failed';

export interface RunResult {
  signature: string;
  startedAt: number;
  /** Wallet round-trip: how long the user's wallet took to sign. Not chain time. */
  signMs: number;
  /** Client -> RPC round-trip for sendRawTransaction. */
  submitMs: number;
  /** All measured from the instant submission began (user-perceived latency). */
  processedMs: number | null;
  confirmedMs: number | null;
  finalizedMs: number | null;
  feeLamports: number | null;
  slot: number | null;
  error?: string;
}

const POLL_INTERVAL_MS = 50;
const FINALIZE_TIMEOUT_MS = 90_000;

export function buildMemoTx(payer: PublicKey, text: string): Transaction {
  const ix = new TransactionInstruction({
    // Listing the payer as a signer makes the memo attributable on-chain, which
    // is what lets the public leaderboard tie a scorecard to an address.
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(text, 'utf8'),
  });
  return new Transaction().add(ix);
}

export const probeMemo = (n: number) => `${MEMO_NAMESPACE} probe n=${n}`;

export const scoreMemo = (r: {
  runs: number;
  p50: number;
  p95: number;
  best: number;
  feeLamports: number;
}) =>
  `${MEMO_NAMESPACE} score runs=${r.runs} p50=${Math.round(r.p50)} p95=${Math.round(
    r.p95,
  )} best=${Math.round(r.best)} fee=${r.feeLamports}`;

type SignFn = (tx: Transaction) => Promise<Uint8Array>;

/**
 * Run one measured transaction.
 *
 * Timing note: the clock starts immediately before `sendRawTransaction` and every
 * milestone is reported relative to that instant, so the numbers are what a user
 * actually waits, not an idealised server-side figure. `submitMs` is reported
 * separately so the RPC round-trip can be subtracted if you want pure chain time.
 */
export async function runOnce(
  payer: PublicKey,
  sign: SignFn,
  n: number,
  onPhase: (p: Phase) => void,
): Promise<RunResult> {
  const startedAt = Date.now();
  const base: RunResult = {
    signature: '',
    startedAt,
    signMs: 0,
    submitMs: 0,
    processedMs: null,
    confirmedMs: null,
    finalizedMs: null,
    feeLamports: null,
    slot: null,
  };

  onPhase('building');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
  const tx = buildMemoTx(payer, probeMemo(n));
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;

  onPhase('signing');
  const tSign = performance.now();
  const signed = await sign(tx);
  base.signMs = performance.now() - tSign;

  onPhase('submitting');
  const t0 = performance.now();
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(signed, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });
  } catch (err) {
    return { ...base, error: describeSendError(err) };
  }
  base.submitMs = performance.now() - t0;
  base.signature = signature;

  const deadline = t0 + FINALIZE_TIMEOUT_MS;
  let seenProcessed = false;
  let seenConfirmed = false;

  while (performance.now() < deadline) {
    let status: SignatureStatus | null = null;
    try {
      status = (await connection.getSignatureStatuses([signature])).value[0] ?? null;
    } catch {
      // Transient RPC hiccup: keep polling rather than failing the run.
    }

    if (status) {
      const now = performance.now();
      if (status.err) {
        return { ...base, slot: status.slot, error: `Transaction failed on-chain: ${JSON.stringify(status.err)}` };
      }
      const level = status.confirmationStatus;
      if (!seenProcessed && level) {
        seenProcessed = true;
        base.processedMs = now - t0;
        base.slot = status.slot;
        onPhase('processed');
      }
      if (!seenConfirmed && (level === 'confirmed' || level === 'finalized')) {
        seenConfirmed = true;
        base.confirmedMs = now - t0;
        onPhase('confirmed');
      }
      if (level === 'finalized') {
        base.finalizedMs = now - t0;
        onPhase('finalized');
        base.feeLamports = await fetchFee(signature);
        return base;
      }
    }

    if (!seenProcessed) {
      const height = await connection.getBlockHeight('confirmed').catch(() => null);
      if (height !== null && height > lastValidBlockHeight) {
        return { ...base, error: 'Blockhash expired before the transaction was picked up.' };
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return { ...base, error: 'Timed out waiting for finalization.' };
}

async function fetchFee(signature: string): Promise<number | null> {
  try {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'finalized',
    });
    return tx?.meta?.fee ?? null;
  } catch {
    return null;
  }
}

function describeSendError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/insufficient|debit an account|0x1\b/i.test(msg)) {
    return 'Not enough COOK to cover the fee. Fund this wallet with a small amount of COOK and try again.';
  }
  if (/blockhash not found|expired/i.test(msg)) {
    return 'Blockhash expired before submission. Try again.';
  }
  if (/rejected|denied|User rejected/i.test(msg)) {
    return 'Signature request was rejected in the wallet.';
  }
  return msg;
}

/** Public scorecards published by any user, newest first. */
export interface Scorecard {
  address: string | null;
  signature: string;
  blockTime: number | null;
  runs: number;
  p50: number;
  p95: number;
  best: number;
  feeLamports: number;
}

export async function fetchScoreboard(limit = 1000): Promise<Scorecard[]> {
  const sigs = await connection.getSignaturesForAddress(MEMO_PROGRAM_ID, { limit });
  const out: Scorecard[] = [];
  for (const s of sigs) {
    if (s.err || !s.memo) continue;
    // RPC prefixes memos with a "[len] " marker.
    const memo = s.memo.replace(/^\[\d+\]\s*/, '');
    if (!memo.startsWith(`${MEMO_NAMESPACE} score`)) continue;
    const num = (k: string) => {
      const m = memo.match(new RegExp(`${k}=(\d+)`));
      return m?.[1] ? Number(m[1]) : null;
    };
    const runs = num('runs');
    const p50 = num('p50');
    const p95 = num('p95');
    const best = num('best');
    if (runs === null || p50 === null || p95 === null || best === null) continue;
    out.push({
      address: null,
      signature: s.signature,
      blockTime: s.blockTime ?? null,
      runs,
      p50,
      p95,
      best,
      feeLamports: num('fee') ?? 0,
    });
  }
  return out;
}
