import { isWithinHours } from './format';

// Sorting, filtering and filter-option helpers for job lists. Every option
// and count is derived from the jobs passed in — nothing is invented.

const FIT_RANK = { 'Excellent Fit': 0, 'Good Fit': 1, 'Average Fit': 2, 'Weak Fit': 3 };

export const SORT_OPTIONS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'newest', label: 'Aging (Newest First)' },
  { id: 'fitment', label: 'Fitment (Excellent Fit to Weak Fit)' },
  { id: 'distance', label: 'Distance (Nearest First)' },
];

// Sort options that need data the jobs may not have.
export function isSortAvailable(sortId, jobs) {
  if (sortId === 'distance') return jobs.some((job) => typeof job.distanceKm === 'number');
  if (sortId === 'fitment') return jobs.some((job) => job.fitLabel in FIT_RANK);
  if (sortId === 'newest') return jobs.some((job) => job.postedAt);
  return true;
}

const AGING_BUCKETS = [
  { value: '24h', label: 'Last 24 hours', hours: 24 },
  { value: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { value: '30d', label: 'Last 30 days', hours: 24 * 30 },
];

const splitLocation = (job) => (job.location ?? '').split(',').map((part) => part.trim());

// The All Filters sections. `getValue` reads the job field the section filters on.
export const FILTER_SECTIONS = [
  { id: 'country', title: 'Country', getValue: (job) => job.country },
  { id: 'location', title: 'Location', searchable: true, getValue: (job) => splitLocation(job)[0] },
  { id: 'company', title: 'Company', searchable: true, getValue: (job) => job.company },
  { id: 'experience', title: 'Experience', getValue: (job) => job.experience },
  { id: 'title', title: 'Job Title', searchable: true, getValue: (job) => job.title },
  { id: 'aging', title: 'Aging', single: true },
  { id: 'state', title: 'State', searchable: true, getValue: (job) => splitLocation(job)[1] },
];

export const EMPTY_FILTERS = Object.fromEntries(
  FILTER_SECTIONS.map((section) => [section.id, section.single ? null : []])
);

export function countActiveFilters(filters) {
  return FILTER_SECTIONS.filter((section) =>
    section.single ? filters[section.id] != null : filters[section.id].length > 0
  ).length;
}

// Options for one section with the number of jobs matching each.
export function getSectionOptions(section, jobs) {
  if (section.id === 'aging') {
    return AGING_BUCKETS.map((bucket) => ({
      value: bucket.value,
      label: bucket.label,
      count: jobs.filter((job) => job.postedAt && isWithinHours(job.postedAt, bucket.hours)).length,
    }));
  }
  const counts = new Map();
  jobs.forEach((job) => {
    const value = section.getValue(job);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function describeSelection(section, filters) {
  const selected = filters[section.id];
  if (section.single) {
    return AGING_BUCKETS.find((bucket) => bucket.value === selected)?.label ?? 'Any';
  }
  if (selected.length === 0) return 'Any';
  return selected.length === 1 ? selected[0] : `${selected.length} selected`;
}

function matchesFilters(job, filters) {
  return FILTER_SECTIONS.every((section) => {
    const selected = filters[section.id];
    if (section.single) {
      if (selected == null) return true;
      const bucket = AGING_BUCKETS.find((item) => item.value === selected);
      return Boolean(job.postedAt) && isWithinHours(job.postedAt, bucket.hours);
    }
    return selected.length === 0 || selected.includes(section.getValue(job));
  });
}

function matchesQuery(job, query) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return [
    job.title,
    job.company,
    job.area,
    job.location,
    ...(job.matchedSkills ?? []),
    ...(job.gapSkills ?? []),
    ...(job.requiredSkills ?? []),
  ]
    .filter(Boolean)
    .some((field) => field.toLowerCase().includes(text));
}

export function filterJobs(jobs, { query = '', verifiedOnly = false, last24h = false, filters }) {
  return jobs.filter(
    (job) =>
      (!verifiedOnly || job.verified) &&
      (!last24h || (job.postedAt && isWithinHours(job.postedAt, 24))) &&
      matchesQuery(job, query) &&
      matchesFilters(job, filters)
  );
}

export function sortJobs(jobs, sortId) {
  if (!isSortAvailable(sortId, jobs)) return jobs;
  const sorted = [...jobs];
  if (sortId === 'newest') {
    sorted.sort((a, b) => new Date(b.postedAt ?? 0) - new Date(a.postedAt ?? 0));
  } else if (sortId === 'fitment') {
    sorted.sort((a, b) => (FIT_RANK[a.fitLabel] ?? 99) - (FIT_RANK[b.fitLabel] ?? 99));
  } else if (sortId === 'distance') {
    sorted.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }
  return sorted;
}
