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

/**
 * The race is scaled to one second because that is the window the *confirmation*
 * claim lives in. Finalization is a different claim: it waits the ~32-slot
 * consensus depth, which is seconds. Both are shown, and they are not conflated.
 */
const FULL_SCALE_MS = 1000;

/** Ticks while a run is in flight so the elapsed time counts up smoothly. */
function useFrameTick(active: boolean): void {
  const [, force] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const loop = () => {
      force((n) => n + 1);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [active]);
}

export function RaceTrack({ race }: { race: RaceState }) {
  // Stop the clock at confirmation: that is what the one-second race is about.
  const raceDone = race.confirmedMs !== null;
  useFrameTick(race.running && !raceDone);

  const elapsed =
    race.confirmedMs ??
    (race.startAt === null || !race.running ? 0 : performance.now() - race.startAt);

  const pct = Math.min(100, (elapsed / FULL_SCALE_MS) * 100);
  const subSecond = race.confirmedMs !== null && race.confirmedMs < FULL_SCALE_MS;

  return (
    <div className={race.demo ? 'race race-demo' : 'race'}>
      <div className="race-head">
        <div className="stopwatch">
          <span className="stopwatch-value">{race.startAt === null ? '0 ms' : fmtMs(elapsed)}</span>
          <span className="stopwatch-label">
            {raceDone ? 'to confirmation' : race.running ? 'elapsed' : 'ready'}
          </span>
        </div>
        {race.demo ? <span className="demo-tag">simulated replay</span> : null}
        {subSecond ? <span className="beat">confirmed under one second ✔</span> : null}
      </div>

      <div className="track" aria-hidden="true">
        <div className="track-fill" style={{ width: `${pct}%` }} />
        <span className="track-mark" style={{ left: '100%' }}>
          <em>1s</em>
        </span>
      </div>

      <div className="stage-row">
        <Stage label="Processed" value={race.processedMs} blurb="in a block" />
        <Stage label="Confirmed" value={race.confirmedMs} blurb="supermajority voted" />
        <Stage
          label="Finalized"
          value={race.finalizedMs}
          blurb="irreversible · ~31 slots later"
          offScale
        />
      </div>

      <p className="race-note muted small">
        The one-second race measures <strong>confirmation</strong> — the point a supermajority has
        voted, and what a user actually waits for. <strong>Finalization</strong> is a separate
        guarantee that waits the usual ~32-slot consensus depth, so it lands seconds later by
        design, not milliseconds. Conflating the two would flatter the chain inaccurately.
      </p>
    </div>
  );
}

function Stage({
  label,
  value,
  blurb,
  offScale,
}: {
  label: string;
  value: number | null;
  blurb: string;
  offScale?: boolean;
}) {
  const done = value !== null;
  return (
    <div className={done ? 'stage done' : 'stage'}>
      <span className={offScale && done ? 'stage-dot off-scale' : 'stage-dot'} />
      <span className="stage-label">{label}</span>
      <span className="stage-value">{done ? fmtMs(value) : '—'}</span>
      <span className="stage-blurb">{blurb}</span>
    </div>
  );
}

/**
 * Illustrative replay for visitors without a wallet or COOK.
 *
 * Timings are the values this tool actually measured on Cookie Chain: confirmation
 * inside half a second, finalization about 15.6s later at ~31 slots depth. The
 * finalization *wait* is compressed so the replay does not stall for 15 seconds;
 * the figure shown is the real one, and the panel is tagged as a replay throughout.
 */
export function runDemo(update: (r: RaceState) => void, done: () => void): () => void {
  const startAt = performance.now();
  const MEASURED = { processed: 420, confirmed: 460, finalized: 15_610 };
  const base: RaceState = { ...IDLE_RACE, startAt, running: true, demo: true };
  update(base);

  const timers: number[] = [];
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

  at(MEASURED.processed, () => update({ ...base, processedMs: MEASURED.processed }));
  at(MEASURED.confirmed, () =>
    update({ ...base, processedMs: MEASURED.processed, confirmedMs: MEASURED.confirmed }),
  );
  // Compressed: the displayed finalization figure is real, the waiting is not.
  at(MEASURED.confirmed + 1100, () => {
    update({
      ...base,
      processedMs: MEASURED.processed,
      confirmedMs: MEASURED.confirmed,
      finalizedMs: MEASURED.finalized,
      running: false,
    });
    done();
  });

  return () => timers.forEach((t) => window.clearTimeout(t));
}
