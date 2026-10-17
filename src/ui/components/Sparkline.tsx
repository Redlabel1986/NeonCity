/** Minimal SVG line chart for time series (balance, guests). */
export function Sparkline({
  values,
  labels,
  height = 120,
  color = 'var(--color-cyan)',
  format,
  ariaLabel,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  color?: string;
  format: (v: number) => string;
  ariaLabel: string;
}) {
  const width = 420;
  const padX = 8;
  const padY = 12;
  if (values.length < 2) {
    return <p className="text-xs text-muted">Noch nicht genug Daten. Nach dem ersten Tagesabschluss erscheint hier der Verlauf.</p>;
  }
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => padX + (i / (values.length - 1)) * (width - padX * 2);
  const y = (v: number) => height - padY - ((v - min) / span) * (height - padY * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const zeroY = y(0);
  const last = values[values.length - 1]!;
  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${ariaLabel}: aktuell ${format(last)}, Minimum ${format(min)}, Maximum ${format(max)}`}>
        <line x1={padX} x2={width - padX} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 4" />
        <polyline fill="none" stroke={color} strokeWidth={1.8} points={points} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(values.length - 1)} cy={y(last)} r={3} fill={color} />
        <text x={padX} y={padY - 3} fill="var(--color-muted)" fontSize={10}>
          {format(max)}
        </text>
        <text x={padX} y={height - 2} fill="var(--color-muted)" fontSize={10}>
          {format(min)}
        </text>
      </svg>
      {labels && (
        <figcaption className="num flex justify-between text-[0.65rem] text-muted">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </figcaption>
      )}
    </figure>
  );
}
