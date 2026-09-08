import { useCallback, useEffect, useState } from 'react';
import { fetchScoreboard, type Scorecard } from '../lib/bench';
import { explorerTx } from '../lib/chain';
import { fmtCook, fmtMs, shortAddr } from '../lib/format';

/**
 * Every scorecard here was published as a Memo transaction by a real user. The
 * data is read straight off Cookie Chain, so anyone can independently verify a
 * row by opening its transaction — there is no backend and nothing to trust.
 */
export function Scoreboard() {
  const [rows, setRows] = useState<Scorecard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cards = await fetchScoreboard();
      cards.sort((a, b) => a.p50 - b.p50);
      setRows(cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the scoreboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Public scoreboard</h2>
        <button className="ghost small-btn" disabled={loading} onClick={() => void load()}>
          {loading ? 'Reading chain…' : 'Refresh'}
        </button>
      </div>
      <p className="muted small">
        Published scorecards, read directly from the Memo program on Cookie Chain and ranked by
        median finality. Every row links to its on-chain transaction.
      </p>

      {error ? <p className="error">{error}</p> : null}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="empty">
          <p>No scorecards published yet.</p>
          <p className="muted small">
            Run the finality lab above and publish one — it will be the first on Cookie Chain.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Median</th>
                <th>p95</th>
                <th>Best</th>
                <th>Runs</th>
                <th>Fee</th>
                <th>When</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.signature}>
                  <td>{i + 1}</td>
                  <td className="accent-text">{fmtMs(r.p50)}</td>
                  <td>{fmtMs(r.p95)}</td>
                  <td>{fmtMs(r.best)}</td>
                  <td>{r.runs}</td>
                  <td>{fmtCook(r.feeLamports)}</td>
                  <td className="muted">
                    {r.blockTime ? new Date(r.blockTime * 1000).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <a href={explorerTx(r.signature)} target="_blank" rel="noreferrer">
                      {shortAddr(r.signature, 4)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
