export const fmtInt = (n: number) => n.toLocaleString('en-US');

export const fmtMs = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

export const fmtCook = (lamports: number) => {
  const cook = lamports / 1_000_000_000;
  if (cook === 0) return '0 COOK';
  if (cook < 0.000001) return `${lamports} lamports`;
  return `${cook.toFixed(9).replace(/0+$/, '').replace(/\.$/, '')} COOK`;
};

export const shortAddr = (a: string, n = 4) =>
  a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;

/** Percentile over an unsorted sample, using nearest-rank. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[idx] ?? null;
}

export const mean = (v: number[]) =>
  v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
