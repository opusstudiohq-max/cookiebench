import { useCallback, useMemo, useState } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { runOnce, buildMemoTx, scoreMemo, type Phase, type RunResult } from '../lib/bench';
import { connection, explorerTx } from '../lib/chain';
import { fmtCook, fmtMs, mean, percentile, shortAddr } from '../lib/format';
import {
  connectWallet,
  disconnectWallet,
  signTransaction,
  sortWallets,
  type DetectedWallet,
  type StandardAccount,
} from '../lib/wallet';
import { Histogram, Series } from './Charts';

const PHASE_TEXT: Record<Phase, string> = {
  idle: 'Idle',
  building: 'Fetching a fresh blockhash…',
  signing: 'Waiting for your wallet signature…',
  submitting: 'Broadcasting to rpc.cookiescan.io…',
  processed: 'Processed — landed in a block',
  confirmed: 'Confirmed — supermajority voted',
  finalized: 'Finalized — irreversible',
  failed: 'Failed',
};

interface Props {
  wallets: DetectedWallet[];
  onRefreshWallets: () => void;
}

export function FinalityLab({ wallets, onRefreshWallets }: Props) {
  const [wallet, setWallet] = useState<DetectedWallet | null>(null);
  const [account, setAccount] = useState<StandardAccount | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [runs, setRuns] = useState(5);
  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [publishSig, setPublishSig] = useState<string | null>(null);

  const sorted = useMemo(() => sortWallets(wallets), [wallets]);

  const finalized = useMemo(
    () => results.map((r) => r.finalizedMs).filter((v): v is number => v !== null),
    [results],
  );
  const confirmed = useMemo(
    () => results.map((r) => r.confirmedMs).filter((v): v is number => v !== null),
    [results],
  );

  const stats = useMemo(() => {
    if (finalized.length === 0) return null;
    const p50 = percentile(finalized, 50);
    const p95 = percentile(finalized, 95);
    const avg = mean(finalized);
    if (p50 === null || p95 === null || avg === null) return null;
    return {
      n: finalized.length,
      p50,
      p95,
      avg,
      best: Math.min(...finalized),
      confirmP50: confirmed.length > 0 ? percentile(confirmed, 50) : null,
      fee: results.find((r) => r.feeLamports !== null)?.feeLamports ?? null,
    };
  }, [finalized, confirmed, results]);

  const refreshBalance = useCallback(async (addr: string) => {
    try {
      setBalance(await connection.getBalance(new PublicKey(addr), 'confirmed'));
    } catch {
      setBalance(null);
    }
  }, []);

  const handleConnect = useCallback(
    async (w: DetectedWallet) => {
      setError(null);
      try {
        const acct = await connectWallet(w);
        setWallet(w);
        setAccount(acct);
        void refreshBalance(acct.address);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Wallet connection failed.');
      }
    },
    [refreshBalance],
  );

  const handleDisconnect = useCallback(async () => {
    if (wallet) await disconnectWallet(wallet).catch(() => undefined);
    setWallet(null);
    setAccount(null);
    setBalance(null);
    setResults([]);
    setPhase('idle');
  }, [wallet]);

  const sign = useCallback(
    async (tx: Transaction) => {
      if (!wallet || !account) throw new Error('Connect a wallet first.');
      return signTransaction(wallet, account, tx);
    },
    [wallet, account],
  );

  const start = useCallback(async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    setResults([]);
    setPublishSig(null);
    const payer = new PublicKey(account.address);
    const collected: RunResult[] = [];
    try {
      for (let i = 1; i <= runs; i += 1) {
        const r = await runOnce(payer, sign, i, setPhase);
        collected.push(r);
        setResults([...collected]);
        if (r.error) {
          setPhase('failed');
          setError(r.error);
          break;
        }
      }
    } catch (e) {
      setPhase('failed');
      setError(e instanceof Error ? e.message : 'Benchmark aborted.');
    } finally {
      setBusy(false);
      void refreshBalance(account.address);
    }
  }, [account, runs, sign, refreshBalance]);

  const publish = useCallback(async () => {
    if (!account || !stats) return;
    setBusy(true);
    setError(null);
    try {
      const payer = new PublicKey(account.address);
      const { blockhash } = await connection.getLatestBlockhash('finalized');
      const tx = buildMemoTx(
        payer,
        scoreMemo({
          runs: stats.n,
          p50: stats.p50,
          p95: stats.p95,
          best: stats.best,
          feeLamports: stats.fee ?? 0,
        }),
      );
      tx.recentBlockhash = blockhash;
      tx.feePayer = payer;
      const signed = await sign(tx);
      const sig = await connection.sendRawTransaction(signed, { preflightCommitment: 'confirmed' });
      setPublishSig(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish the scorecard.');
    } finally {
      setBusy(false);
      void refreshBalance(account.address);
    }
  }, [account, stats, sign, refreshBalance]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Finality lab</h2>
        {account ? <span className="badge">{shortAddr(account.address, 6)}</span> : null}
      </div>

      {!account ? (
        <div className="connect">
          <p className="muted">
            Connect a Solana-compatible wallet pointed at <code>rpc.cookiescan.io</code>. Every run
            signs and broadcasts a real Memo transaction, so the wallet needs a small COOK balance.
          </p>
          {sorted.length === 0 ? (
            <div className="empty">
              <p>No wallet detected in this browser.</p>
              <p className="muted small">
                Install{' '}
                <a href="https://nightly.app" target="_blank" rel="noreferrer">
                  Nightly
                </a>
                , then add Cookie Chain as a custom SVM network with RPC{' '}
                <code>https://rpc.cookiescan.io</code>.
              </p>
              <button className="ghost" onClick={onRefreshWallets}>
                Re-scan for wallets
              </button>
            </div>
          ) : (
            <div className="wallet-list">
              {sorted.map((w) => (
                <button key={w.name} className="wallet" onClick={() => void handleConnect(w)}>
                  {w.icon ? <img src={w.icon} alt="" width={22} height={22} /> : null}
                  <span>{w.name}</span>
                  {w.name.toLowerCase().includes('nightly') ? <em>recommended</em> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="row-between wrap">
            <div className="muted small">
              Balance: {balance === null ? '—' : fmtCook(balance)}
              <button className="link" onClick={() => void handleDisconnect()}>
                disconnect
              </button>
            </div>
            <label className="runs">
              Runs
              <input
                type="number"
                min={1}
                max={25}
                value={runs}
                disabled={busy}
                onChange={(e) => setRuns(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
              />
            </label>
          </div>

          <div className="actions">
            <button className="primary" disabled={busy} onClick={() => void start()}>
              {busy ? 'Measuring…' : 'Run ' + runs + ' measured transaction' + (runs === 1 ? '' : 's')}
            </button>
            {stats ? (
              <button className="ghost" disabled={busy} onClick={() => void publish()}>
                Publish scorecard on-chain
              </button>
            ) : null}
          </div>

          {phase !== 'idle' ? <p className={'phase phase-' + phase}>{PHASE_TEXT[phase]}</p> : null}

          {error ? <p className="error">{error}</p> : null}
          {publishSig ? (
            <p className="ok">
              Scorecard published.{' '}
              <a href={explorerTx(publishSig)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            </p>
          ) : null}

          {stats ? (
            <>
              <div className="grid stats">
                <Big label="Median finality" value={fmtMs(stats.p50)} accent />
                <Big label="p95 finality" value={fmtMs(stats.p95)} />
                <Big label="Fastest" value={fmtMs(stats.best)} />
                <Big
                  label="Median confirmation"
                  value={stats.confirmP50 === null ? '—' : fmtMs(stats.confirmP50)}
                />
                <Big
                  label="Fee per transaction"
                  value={stats.fee === null ? '—' : fmtCook(stats.fee)}
                />
                <Big label="Samples" value={String(stats.n)} />
              </div>
              <div className="charts">
                <Histogram values={finalized} label="Finality distribution (ms)" />
                <Series values={finalized} label="Finality per run (ms)" />
              </div>
            </>
          ) : null}

          {results.length > 0 ? <ResultsTable results={results} /> : null}
        </>
      )}
    </section>
  );
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={accent ? 'stat accent' : 'stat'}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function ResultsTable({ results }: { results: RunResult[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Processed</th>
            <th>Confirmed</th>
            <th>Finalized</th>
            <th>Submit</th>
            <th>Fee</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={r.signature || i} className={r.error ? 'row-error' : ''}>
              <td>{i + 1}</td>
              <td>{r.processedMs === null ? '—' : fmtMs(r.processedMs)}</td>
              <td>{r.confirmedMs === null ? '—' : fmtMs(r.confirmedMs)}</td>
              <td>{r.finalizedMs === null ? '—' : fmtMs(r.finalizedMs)}</td>
              <td>{fmtMs(r.submitMs)}</td>
              <td>{r.feeLamports === null ? '—' : fmtCook(r.feeLamports)}</td>
              <td>
                {r.signature ? (
                  <a href={explorerTx(r.signature)} target="_blank" rel="noreferrer">
                    {shortAddr(r.signature, 4)}
                  </a>
                ) : (
                  <span className="muted">{r.error ? 'failed' : '—'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
