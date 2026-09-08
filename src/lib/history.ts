import type { CommitmentLag } from './chain';

const KEY = 'cookiebench:observer:v1';
const CAP = 200;

/**
 * Measurements this browser has taken, kept between visits.
 *
 * A single sample says little about a chain: one slow moment is not a trend.
 * Keeping the samples turns repeat visits into a growing record instead of
 * starting from nothing each time.
 *
 * Storage is per-browser and best-effort. A private window, cleared site data
 * or a browser that refuses storage all end up here as "no history", which is
 * a normal state and never an error.
 */
export interface Sample {
  at: number;
  lagMs: number;
  slotGap: number;
}

export function loadHistory(): Sample[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is Sample =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as Sample).at === 'number' &&
          typeof (s as Sample).lagMs === 'number' &&
          typeof (s as Sample).slotGap === 'number',
      )
      .slice(-CAP);
  } catch {
    return [];
  }
}

export function appendHistory(lag: CommitmentLag): Sample[] {
  const next = [
    ...loadHistory(),
    { at: Date.now(), lagMs: lag.lagMs, slotGap: lag.slotGap },
  ].slice(-CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage refused; the samples still live in memory for this visit.
  }
  return next;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; an unreadable store is also an unwritable one.
  }
}
