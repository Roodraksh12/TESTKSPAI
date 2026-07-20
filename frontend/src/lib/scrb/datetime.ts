/**
 * Timestamps come back from the API as bare ISO strings with no timezone
 * designator (the deployed Postgres stores these columns as `timestamp without
 * time zone`, and psycopg serialises them naive). The stored values are UTC, so
 * parsing them with the browser's local timezone shifts every timestamp by the
 * UTC offset — in IST that renders a message sent seconds ago as "5h ago".
 *
 * Appending the Z designator restores the intended instant. The backend applies
 * the same assume-UTC convention in `deadline_engine._parse_reported_date`.
 */
export function parseServerDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const parsed = new Date(hasTimezone ? iso : `${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Short "time since" label for activity lists. */
export function relativeTime(iso: string | null | undefined): string {
  const then = parseServerDate(iso);
  if (!then) return "";

  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return then.toLocaleDateString();
}
