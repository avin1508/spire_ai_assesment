export function formatFileSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "3h ago", "5d ago", "2mo ago" from an ISO date string.
export function formatPostedAge(isoDate, now = Date.now()) {
  const hours = Math.max(0, Math.floor((now - new Date(isoDate).getTime()) / 3600000));
  if (hours < 24) return `${Math.max(1, hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-04" → "Apr 2026"
export function formatMonthYear(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

// Whole months between "YYYY-MM" dates; a null end means "now".
function monthsBetween(start, end) {
  const [startYear, startMonth] = start.split('-').map(Number);
  const now = new Date();
  const [endYear, endMonth] = end
    ? end.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  return Math.max(0, (endYear - startYear) * 12 + (endMonth - startMonth));
}

// "Apr 2026 – Present · 6 mos", "Mar 2023 – Jun 2024 · 1 yr 3 mos"
export function formatDateRange(start, end) {
  const months = monthsBetween(start, end);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (rest || !years) parts.push(`${rest} ${rest === 1 ? 'mo' : 'mos'}`);
  return `${formatMonthYear(start)} – ${end ? formatMonthYear(end) : 'Present'} · ${parts.join(' ')}`;
}

export function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function isWithinHours(isoDate, hours, now = Date.now()) {
  return now - new Date(isoDate).getTime() <= hours * 3600000;
}
