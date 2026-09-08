import { useCallback, useEffect, useRef, useState } from 'react';
import { measureCommitmentLag } from '../lib/chain';
import { fmtMs, mean, percentile } from '../lib/format';
import { appendHistory, clearHistory, loadHistory, type Sample } from '../lib/history';
import { Histogram, Series } from './Charts';

/**
 * Measures Cookie Chain's real commitment latency with no wallet and no funds.
 *
 * This exists because the transaction lab needs COOK, which would leave anyone
 * without a funded wallet — most first-time visitors — with no measured numbers
 * at all. Watching how long a slot takes to travel from `confirmed` to
 * `finalized` needs nothing but public reads, so every visitor gets real data.
 *
 * Sampling keeps going while the page is open, and the samples are kept between
 * visits, because one measurement is an anecdote and a hundred is a picture.
 */
export function FinalityObserver() {
  const [samples, setSamples] = useState<Sample[]>(() => loadHistory());
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const running = useRef(false);

  const sample = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await measureCommitmentLag();
      if (cancelled.current) return;
      if (r === null) setError('Timed out waiting for the finalized head to advance.');
      else setSamples(appendHistory(r));
    } catch (e) {
      if (!cancelled.current) {
        setError(e instanceof Error ? e.message : 'Measurement failed.');
      }
    } finally {
      running.current = false;
      if (!cancelled.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  // Keep measuring while the tab is open and auto is on. Each measurement
  // already waits out a full finalization, so this paces itself.
  useEffect(() => {
    if (!auto) return undefined;
    void sample();
    const id = setInterval(() => {
      if (!document.hidden) void sample();
    }, 20_000);
    return () => clearInterval(id);
  }, [auto, sample]);

  const lags = samples.map((s) => s.lagMs);
  const avg = mean(lags);
  const p50 = percentile(lags, 50);
  const p95 = percentile(lags, 95);
  const depth = mean(samples.map((s) => s.slotGap));
  const best = lags.length > 0 ? Math.min(...lags) : null;

  const reset = () => {
    clearHistory();
    setSamples([]);
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Finality observer</h2>
        <div className="obs-controls">
          <label className="auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            keep measuring
          </label>
          <button className="ghost small-btn" disabled={busy} onClick={() => void sample()}>
            {busy ? 'Measuring…' : 'Sample now'}
          </button>
        </div>
      </div>

      <p className="muted small">
        Real measurement, no wallet and no COOK required. It takes the current <code>confirmed</code>{' '}
        head and times how long the <code>finalized</code> head needs to reach it — the true cost of
        irreversibility. Each sample takes about 15 seconds, and samples are kept in this browser
        between visits, because one measurement is an anecdote.
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
          <span className="stat-label">p95</span>
          <span className="stat-value">{p95 === null ? '—' : fmtMs(p95)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Fastest</span>
          <span className="stat-value">{best === null ? '—' : fmtMs(best)}</span>
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
          <span className="stat-label">Samples kept</span>
          <span className="stat-value">{String(samples.length)}</span>
        </div>
      </div>

      {lags.length >= 2 ? (
        <div className="charts">
          <Series values={lags} label="Confirmed → finalized per sample (ms)" />
          <Histogram values={lags} label="Distribution across kept samples (ms)" />
        </div>
      ) : (
        <p className="muted small">
          The first sample lands in about 15 seconds; the charts appear once there are two.
        </p>
      )}

      <p className="muted small">
        Confirmation tracks the chain head within roughly a single slot, which is where the
        sub-second claim holds. Finalization deliberately waits the ~32-slot consensus depth, so it
        is measured in seconds. Reporting only the flattering half of that would be misleading.
        {samples.length > 0 ? (
          <>
            {' '}
            <button className="link" onClick={reset}>
              forget these samples
            </button>
          </>
        ) : null}
      </p>
    </section>
  );
}
