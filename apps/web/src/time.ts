const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/** A friendly "when": "just now", "5 minutes ago", "yesterday", or a date once it is more than a week old. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const age = now.getTime() - then.getTime();

  if (age < MINUTE) return 'just now'; // also covers a clock a little ahead of ours
  if (age < HOUR) return plural(Math.floor(age / MINUTE), 'minute');
  if (age < DAY) return plural(Math.floor(age / HOUR), 'hour');
  const days = Math.floor(age / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `${then.getDate()} ${MONTHS[then.getMonth()]} ${then.getFullYear()}`;
}
