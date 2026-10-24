// Turns the All Jobs screen state into All Jobs API query parameters.
// (No imports: this file is also loaded by the Node test runner.)

// Filter section id → API parameter (they share names; "aging" is single-valued).
const MULTI_VALUE_SECTIONS = ['country', 'location', 'company', 'experience', 'title', 'state'];

// Search, chips and All Filters → API filter parameters. Empty values are left
// out so equal states always produce equal parameters (and cache keys).
export function buildFilterParams({ query = '', verifiedOnly = false, last24h = false, filters = {} }) {
  const params = {};
  const text = query.trim();
  if (text) params.q = text;
  MULTI_VALUE_SECTIONS.forEach((section) => {
    const values = filters[section];
    if (values?.length) params[section] = [...values].sort();
  });
  if (filters.aging) params.aging = filters.aging;
  if (verifiedOnly) params.verified = 'true';
  if (last24h) params.last24h = 'true';
  return params;
}

// { west, south, east, north } → "west,south,east,north" (API bbox format).
export function bboxParam(bounds) {
  return [bounds.west, bounds.south, bounds.east, bounds.north].map((value) => Number(value.toFixed(6))).join(',');
}

// Parameters object → query string. Arrays become repeated parameters;
// keys are sorted so the same parameters always give the same string.
export function toQueryString(params) {
  const parts = [];
  Object.keys(params)
    .sort()
    .forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null || value === '') return;
      (Array.isArray(value) ? value : [value]).forEach((item) => {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      });
    });
  return parts.join('&');
}

// Stable identity for a set of parameters (used to detect changes).
export const paramsKey = (params) => toQueryString(params);
