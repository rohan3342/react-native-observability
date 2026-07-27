/**
 * Formats a timestamp as a short relative string ("now", "5s", "3m", "2h",
 * "4d") for compact display in list rows. Falls back to a localized date for
 * anything older than ~7 days. The absolute ISO time is shown in detail sheets.
 *
 * `nowMs` is injectable so the output is deterministic in tests.
 */
export function formatRelativeTime(ts: number, nowMs: number = Date.now()): string {
  const diff = nowMs - ts;
  if (diff < 0) return 'now';
  const s = Math.floor(diff / 1000);
  if (s < 1) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}
