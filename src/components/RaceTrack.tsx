import { useEffect, useRef, useState } from 'react';
import { fmtMs } from '../lib/format';

export interface RaceState {
  /** performance.now() at the instant submission began, or null when idle. */
  startAt: number | null;
  processedMs: number | null;
  confirmedMs: number | null;
  finalizedMs: number | null;
  running: boolean;
  /** True when the timings are an illustrative replay rather than a real transaction. */
  demo: boolean;
}

export const IDLE_RACE: RaceState = {
  startAt: null,
  processedMs: null,
  confirmedMs: null,
  finalizedMs: null,
  running: false,
  demo: false,
};

const STAGES = [
  { key: 'processedMs', label: 'Processed', blurb: 'in a block' },
  { key: 'confirmedMs', label: 'Confirmed', blurb: 'supermajority' },
  { key: 'finalizedMs', label: 'Finalized', blurb: 'irreversible' },
] as const;

/** Ticks while a run is in flight so the elapsed time counts up smoothly. */
function useElapsed(startAt: number | null, running: boolean): number {
  const [, force] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!running || startAt === null) return;
    const loop = () => {
      force((n) => n + 1);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [running, startAt]);

  if (startAt === null) return 0;
  return performance.now() - startAt;
}

/**
 * The visual centrepiece: a stopwatch racing a real transaction through Cookie
 * Chain's three commitment levels. The scale is fixed at one second so
 * sub-second finality is immediately legible — the bar simply does not reach
 * the end before the run is done.
 */
export function RaceTrack({ race }: { race: RaceState }) {
  const live = useElapsed(race.startAt, race.running);
  const settled = race.finalizedMs ?? null;
  const elapsed = settled ?? (race.startAt === null ? 0 : live);

  const FULL_SCALE_MS = 1000;
  const pct = Math.min(100, (elapsed / FULL_SCALE_MS) * 100);
  const beatOneSecond = settled !== null && settled < FULL_SCALE_MS;

  return (
    <div className={race.demo ? 'race race-demo' : 'race'}>
      <div className="race-head">
        <div className="stopwatch">
          <span className="stopwatch-value">{race.startAt === null ? '0 ms' : fmtMs(elapsed)}</span>
          <span className="stopwatch-label">
            {race.running ? 'elapsed' : settled === null ? 'ready' : 'to finality'}
          </span>
        </div>
        {race.demo ? <span className="demo-tag">simulated replay</span> : null}
        {beatOneSecond ? <span className="beat">under one second ✔</span> : null}
      </div>

      <div className="track" aria-hidden="true">
        <div className="track-fill" style={{ width: `${pct}%` }} />
        <span className="track-mark" style={{ left: '100%' }}>
          <em>1s</em>
        </span>
      </div>

      <div className="stage-row">
        {STAGES.map((s) => {
          const value = race[s.key];
          const done = value !== null;
          return (
            <div key={s.key} className={done ? 'stage done' : 'stage'}>
              <span className="stage-dot" />
              <span className="stage-label">{s.label}</span>
              <span className="stage-value">{done ? fmtMs(value) : '—'}</span>
              <span className="stage-blurb">{s.blurb}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Drives an illustrative replay so the visualisation is usable with no wallet and
 * no COOK. Timings are plausible values in the range this tool actually measures;
 * the UI labels them as simulated and no transaction is ever created.
 */
export function runDemo(update: (r: RaceState) => void, done: () => void): () => void {
  const startAt = performance.now();
  const timings = { processed: 260, confirmed: 430, finalized: 690 };
  const base: RaceState = { ...IDLE_RACE, startAt, running: true, demo: true };
  update(base);

  const timers: number[] = [];
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

  at(timings.processed, () => update({ ...base, processedMs: timings.processed }));
  at(timings.confirmed, () =>
    update({ ...base, processedMs: timings.processed, confirmedMs: timings.confirmed }),
  );
  at(timings.finalized, () => {
    update({
      ...base,
      processedMs: timings.processed,
      confirmedMs: timings.confirmed,
      finalizedMs: timings.finalized,
      running: false,
    });
    done();
  });

  return () => timers.forEach((t) => window.clearTimeout(t));
}
