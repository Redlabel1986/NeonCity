const intFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const decFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function credits(value: number): string {
  return `${intFormat.format(Math.round(value))} ¢`;
}

export function signedCredits(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±';
  return `${sign}${intFormat.format(Math.abs(rounded))} ¢`;
}

export function integer(value: number): string {
  return intFormat.format(Math.round(value));
}

export function decimal(value: number): string {
  return decFormat.format(value);
}

export function percent(value: number): string {
  return `${Math.round(value)} %`;
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d} T ${rh} h` : `${d} T`;
}

export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  return new Date(timestamp).toLocaleDateString('de-DE');
}
