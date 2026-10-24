export const c = {
  ink: '#21181f',
  brass: '#8c5d77',
  blush: '#fbd3e4',
  highlight: '#c7a3b8',
  bg: '#fcf9fb',
  card: '#FFFFFF',
  line: '#f2e6ee',
  text: '#21181f',
  mute: '#75636f',
  ok: '#16a34a',
  bad: '#dc2626',
  warn: '#dc2626'
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = (n: any) => inr.format(Number(n) || 0);

export const cleanRoomNumber = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'object') {
    const candidate = val.room_number || val.room || val.roomNumber || val.room_numbers || val.room_no || val.name || val.id || '';
    return cleanRoomNumber(candidate);
  }
  return String(val)
    .replace(/^Room\s*#?/i, '')
    .replace(/\b(Bed\s*room|Bedroom|Room)\b/gi, '')
    .trim();
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Universal Indian Standard Time (IST = UTC + 05:30) Formatter.
 * Deterministic across all JavaScript runtimes (Hermes, Android, iOS, Web).
 * Does NOT rely on browser/Hermes Intl timeZone support which fails on Android.
 */
export function formatIST(
  input: any,
  opts?: { withYear?: boolean; dateOnly?: boolean; timeOnly?: boolean; fallback?: string }
): string {
  const fallback = opts?.fallback ?? '-';
  if (!input) return fallback;
  const raw = String(input).trim();
  if (!raw || raw === 'null' || raw === 'undefined') return fallback;

  let epochMs = NaN;

  // 1. Explicit timezone offset (+05:30, +00:00, Z, etc.)
  if (raw.includes('+') || raw.endsWith('Z') || raw.endsWith('z') || /[-+]\d{2}:\d{2}$/.test(raw)) {
    epochMs = new Date(raw).getTime();
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}(:\d{2})?/.test(raw)) {
    // 2. Format "YYYY-MM-DDTHH:mm[:ss]" or "YYYY-MM-DD HH:mm[:ss]" without timezone -> Local IST!
    epochMs = new Date(raw.replace(' ', 'T') + '+05:30').getTime();
  } else {
    // 3. Fallback generic Date parse
    epochMs = new Date(raw).getTime();
  }

  if (isNaN(epochMs)) return raw;

  // Shift precisely by IST offset (+5h 30m = 19,800,000 ms)
  const IST_OFFSET_MS = 19800000;
  const d = new Date(epochMs + IST_OFFSET_MS);

  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = SHORT_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  const hStr = String(h).padStart(2, '0');

  if (opts?.dateOnly) {
    return `${day} ${month}${opts.withYear ? ' ' + year : ''}`;
  }
  if (opts?.timeOnly) {
    return `${hStr}:${m} ${ampm}`;
  }
  if (opts?.withYear) {
    return `${day} ${month} ${year}, ${hStr}:${m} ${ampm}`;
  }
  return `${day} ${month}, ${hStr}:${m} ${ampm}`;
}

export const when = (s?: string) => formatIST(s);
export const formatDT = (s?: string) => formatIST(s, { withYear: true });
