export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export function startOfDay(time = Date.now()): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function daysAgo(time: number): number {
  return Math.round((startOfDay() - startOfDay(time)) / DAY);
}

export function ago(time: number): string {
  const n = daysAgo(time);
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** Accepts 09XXXXXXXXX, 9XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX and returns +639XXXXXXXXX, or null. */
export function normalizeMobile(value: string): string | null {
  const d = value.replace(/[\s\-()]/g, '');
  if (/^\+639\d{9}$/.test(d)) return d;
  if (/^639\d{9}$/.test(d)) return '+' + d;
  if (/^09\d{9}$/.test(d)) return '+63' + d.slice(1);
  if (/^9\d{9}$/.test(d)) return '+63' + d;
  return null;
}
