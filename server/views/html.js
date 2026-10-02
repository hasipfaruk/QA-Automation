// Tiny HTML templating: every interpolated value is escaped unless it is already SafeHtml.

class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

function render(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new SafeHtml(out);
}

/** Mark a trusted string as HTML. Never pass user input to this. */
export const raw = (s) => new SafeHtml(String(s));

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export function timeAgo(iso) {
  if (!iso) return '';
  const sec = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (sec < 60) return 'just now';
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [name, size] of units) {
    const n = Math.floor(sec / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

export function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}
