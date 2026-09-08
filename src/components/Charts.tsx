interface HistogramProps {
  values: number[];
  bins?: number;
  label: string;
}

/**
 * Hand-rolled SVG so the bundle carries no charting dependency. Values are
 * latency samples in milliseconds.
 */
export function Histogram({ values, bins = 12, label }: HistogramProps) {
  if (values.length === 0) {
    return <p className="muted small">No samples yet.</p>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const i = Math.min(bins - 1, Math.floor(((v - min) / span) * bins));
    counts[i] = (counts[i] ?? 0) + 1;
  }
  const peak = Math.max(...counts, 1);
  const W = 520;
  const H = 140;
  const bw = W / bins;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H + 26}`} role="img" aria-label={label} preserveAspectRatio="none">
        {counts.map((c, i) => {
          const h = (c / peak) * H;
          return (
            <rect
              key={i}
              x={i * bw + 1}
              y={H - h}
              width={bw - 2}
              height={h}
              rx={2}
              className="bar"
            />
          );
        })}
        <line x1={0} y1={H} x2={W} y2={H} className="axis" />
        <text x={0} y={H + 18} className="tick">{Math.round(min)} ms</text>
        <text x={W} y={H + 18} textAnchor="end" className="tick">{Math.round(max)} ms</text>
      </svg>
      <figcaption className="muted small">{label}</figcaption>
    </figure>
  );
}

interface SeriesProps {
  values: number[];
  label: string;
}

/** Run-over-run latency, so drift and outliers are visible rather than averaged away. */
export function Series({ values, label }: SeriesProps) {
  if (values.length < 2) return <p className="muted small">Need at least two runs to plot a trend.</p>;
  const W = 520;
  const H = 120;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / span) * (H - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
        <polyline points={pts} className="line" />
      </svg>
      <figcaption className="muted small">{label}</figcaption>
    </figure>
  );
}

/** Horizontal progress meter used for epoch position. */
export function Meter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="meter" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
