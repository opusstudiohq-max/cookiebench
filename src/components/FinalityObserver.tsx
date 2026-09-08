import { useCallback, useEffect, useRef, useState } from 'react';
import { measureCommitmentLag, type CommitmentLag } from '../lib/chain';
import { fmtMs, mean, percentile } from '../lib/format';
import { Series } from './Charts';

/**
 * Measures Cookie Chain's real commitment latency with no wallet and no funds.
 *
 * This exists because the transaction lab needs COOK, which would leave anyone
 * without a funded wallet — most first-time visitors — with no measured numbers at
 * all. Watching how long a slot takes to travel from `confirmed` to `finalized`
 * needs nothing but public reads, so every visitor gets real data.
 */
export function FinalityObserver() {
  const [samples, setSamples] = useState<CommitmentLag[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const sample = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await measureCommitmentLag();
      if (cancelled.current) return;
      if (r === null) setError('Timed out waiting for the finalized head to advance.');
      else setSamples((prev) => [...prev, r]);
    } catch (e) {
      if (!cancelled.current) {
        setError(e instanceof Error ? e.message : 'Measurement failed.');
      }
    } finally {
      if (!cancelled.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    void sample();
    return () => {
      cancelled.current = true;
    };
  }, [sample]);

  const lags = samples.map((s) => s.lagMs);
  const avg = mean(lags);
  const p50 = percentile(lags, 50);
  const depth = mean(samples.map((s) => s.slotGap));

  return (
    <section className="card">
      <div className="card-head">
        <h2>Finality observer</h2>
        <button className="ghost small-btn" disabled={busy} onClick={() => void sample()}>
          {busy ? 'Measuring…' : 'Take another sample'}
        </button>
      </div>

      <p className="muted small">
        Real measurement, no wallet and no COOK required. It takes the current{' '}
        <code>confirmed</code> head and times how long the <code>finalized</code> head needs to
        reach it — the true cost of irreversibility. Each sample takes about 15 seconds.
      </p>

      {error ? <p className="error">{error}</p> : null}

      <div className="grid stats">
        <div className="stat accent">
          <span className="stat-label">Median confirmed → finalized</span>
          <span className="stat-value">
            {p50 === null ? (busy ? 'measuring…' : '—') : fmtMs(p50)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Mean</span>
          <span className="stat-value">{avg === null ? '—' : fmtMs(avg)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Consensus depth</span>
          <span className="stat-value">{depth === null ? '—' : `${depth.toFixed(1)} slots`}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Samples</span>
          <span className="stat-value">{String(samples.length)}</span>
        </div>
      </div>

      {lags.length >= 2 ? <Series values={lags} label="Confirmed → finalized per sample (ms)" /> : null}

      <p className="muted small">
        Confirmation tracks the chain head within roughly a single slot, which is where the
        sub-second claim holds. Finalization deliberately waits the ~32-slot consensus depth, so it
        is measured in seconds. Reporting only the flattering half of that would be misleading.
      </p>
    </section>
  );
}
