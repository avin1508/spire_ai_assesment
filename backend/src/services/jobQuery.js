// Parses and validates All Jobs query parameters and builds the MongoDB filter.
// Every jobs endpoint uses buildJobFilter(), so the list, map, counts and
// filter options always agree for the same parameters.

import { EXPERIENCE_LEVELS } from '../models/job.model.js';
import { ValidationError } from '../utils/httpErrors.js';

export const MAX_QUERY_LENGTH = 100;
export const MAX_VALUE_LENGTH = 120;
export const MAX_VALUES = 50;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const MAX_PAGE = 500;
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 20;

export const SORTS = ['recommended', 'newest', 'distance'];

// "Aging" options of the All Filters sheet (hours).
export const AGING_HOURS = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };

// Multi-value filters: query parameter → document field. Parameter names match
// the frontend's filter section ids ("location" is the city).
export const LIST_FILTERS = {
  country: 'country',
  location: 'city',
  state: 'state',
  company: 'companyName',
  title: 'title',
  experience: 'experience',
};

// Fields the search box matches (the same fields the app searched locally).
export const SEARCH_FIELDS = ['title', 'companyName', 'area', 'city', 'state', 'requiredSkills'];

const FILTER_PARAMS = ['q', ...Object.keys(LIST_FILTERS), 'aging', 'verified', 'last24h', 'bbox'];

// Collects problems so one response can report every invalid parameter.
function createIssues() {
  const issues = [];
  return {
    add: (param, message) => issues.push({ param, message }),
    throwIfAny: () => {
      if (issues.length > 0) throw new ValidationError(issues);
    },
  };
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function rejectUnknown(query, allowed, issues) {
  Object.keys(query).forEach((key) => {
    if (!allowed.includes(key)) issues.add(key, 'is not a supported parameter');
  });
}

// A single string value (repeated parameters are rejected).
function readString(query, name, issues) {
  const value = query[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    issues.add(name, 'must be given once');
    return undefined;
  }
  return value;
}

function readBoolean(query, name, issues) {
  const value = readString(query, name, issues);
  if (value === undefined) return false;
  if (value !== 'true' && value !== 'false') {
    issues.add(name, 'must be "true" or "false"');
    return false;
  }
  return value === 'true';
}

function readInteger(query, name, { min, max, fallback }, issues) {
  const value = readString(query, name, issues);
  if (value === undefined || value === '') return fallback;
  if (!/^-?\d+$/.test(value)) {
    issues.add(name, 'must be a whole number');
    return fallback;
  }
  const number = Number(value);
  if (number < min || number > max) {
    issues.add(name, `must be between ${min} and ${max}`);
    return fallback;
  }
  return number;
}

function readNumber(query, name, { min, max }, issues) {
  const value = readString(query, name, issues);
  if (value === undefined) return undefined;
  const number = value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    issues.add(name, `must be a number between ${min} and ${max}`);
    return undefined;
  }
  return number;
}

// "west,south,east,north" in degrees. Boxes crossing the antimeridian are not
// supported (west must be ≤ east); India never needs them.
export function parseBbox(value, issues, name = 'bbox') {
  if (typeof value !== 'string') {
    issues.add(name, 'must be given once as "west,south,east,north"');
    return undefined;
  }
  const parts = value.split(',').map((part) => (part.trim() === '' ? NaN : Number(part)));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    issues.add(name, 'must be four numbers: "west,south,east,north"');
    return undefined;
  }
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    issues.add(name, 'is outside the valid longitude/latitude range');
    return undefined;
  }
  if (west > east || south > north) {
    issues.add(name, 'west must be ≤ east and south must be ≤ north');
    return undefined;
  }
  return { west, south, east, north };
}

// Search, filters and chips shared by every jobs endpoint.
function readFilters(query, issues) {
  const filters = {};

  const q = readString(query, 'q', issues);
  if (q !== undefined) {
    const text = q.trim();
    if (text.length > MAX_QUERY_LENGTH) issues.add('q', `must be at most ${MAX_QUERY_LENGTH} characters`);
    else if (text) filters.q = text;
  }

  Object.keys(LIST_FILTERS).forEach((name) => {
    const raw = query[name];
    if (raw === undefined) return;
    const values = (Array.isArray(raw) ? raw : [raw]).map((value) => String(value).trim());
    if (values.length > MAX_VALUES) issues.add(name, `accepts at most ${MAX_VALUES} values`);
    else if (values.some((value) => !value || value.length > MAX_VALUE_LENGTH)) {
      issues.add(name, `values must be 1–${MAX_VALUE_LENGTH} characters`);
    } else if (name === 'experience' && values.some((value) => !EXPERIENCE_LEVELS.includes(value))) {
      issues.add(name, `must be one of: ${EXPERIENCE_LEVELS.join(', ')}`);
    } else filters[name] = [...new Set(values)];
  });

  const aging = readString(query, 'aging', issues);
  if (aging !== undefined) {
    if (!(aging in AGING_HOURS)) issues.add('aging', `must be one of: ${Object.keys(AGING_HOURS).join(', ')}`);
    else filters.aging = aging;
  }

  if (readBoolean(query, 'verified', issues)) filters.verified = true;
  if (readBoolean(query, 'last24h', issues)) filters.last24h = true;

  if (query.bbox !== undefined) filters.bbox = parseBbox(query.bbox, issues);
  return filters;
}

// MongoDB filter for parsed filters. `now` is injectable for tests.
export function buildJobFilter(filters, now = Date.now()) {
  const filter = {};

  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), 'i');
    filter.$or = SEARCH_FIELDS.map((field) => ({ [field]: pattern }));
  }

  Object.entries(LIST_FILTERS).forEach(([name, field]) => {
    if (filters[name]?.length) filter[field] = { $in: filters[name] };
  });

  if (filters.verified) filter.verified = true;

  // The Aging section and the "Last 24 hours" chip combine (both must match).
  const hours = [filters.aging && AGING_HOURS[filters.aging], filters.last24h && 24].filter(Boolean);
  if (hours.length > 0) {
    filter.postedAt = { $gte: new Date(now - Math.min(...hours) * 3600000) };
  }

  if (filters.bbox) Object.assign(filter, bboxFilter(filters.bbox));
  return filter;
}

// Up to this width the 2dsphere index is used to narrow candidates.
const GEO_INDEX_MAX_WIDTH = 120;
// Polygon edges are great circles. Splitting the east–west edges into ≤1°
// segments and adding this margin keeps the polygon a superset of the
// rectangle; the latitude/longitude ranges below then make the match exact.
const GEO_MARGIN = 0.01;

// Jobs inside a map rectangle, matched exactly on latitude/longitude, with a
// $geoWithin polygon so MongoDB can use the 2dsphere index.
export function bboxFilter({ west, south, east, north }) {
  const filter = {
    latitude: { $gte: south, $lte: north },
    longitude: { $gte: west, $lte: east },
  };
  if (east - west > GEO_INDEX_MAX_WIDTH) return filter;

  const w = Math.max(-180, west - GEO_MARGIN);
  const e = Math.min(180, east + GEO_MARGIN);
  const s = Math.max(-89.9, south - GEO_MARGIN);
  const n = Math.min(89.9, north + GEO_MARGIN);
  const steps = Math.max(1, Math.ceil(e - w));
  const along = (lat, from, to) =>
    Array.from({ length: steps + 1 }, (_, i) => [from + ((to - from) * i) / steps, lat]);
  const ring = [...along(s, w, e), ...along(n, e, w)];
  ring.push(ring[0]);
  filter.geo = { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [ring] } } };
  return filter;
}

// GET /api/jobs — list page.
export function parseListQuery(query) {
  const issues = createIssues();
  rejectUnknown(query, [...FILTER_PARAMS, 'page', 'limit', 'sort', 'lat', 'lng'], issues);
  const filters = readFilters(query, issues);
  const page = readInteger(query, 'page', { min: 1, max: MAX_PAGE, fallback: 1 }, issues);
  const limit = readInteger(query, 'limit', { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT }, issues);

  const sort = readString(query, 'sort', issues) ?? 'recommended';
  if (!SORTS.includes(sort)) issues.add('sort', `must be one of: ${SORTS.join(', ')}`);

  const lat = readNumber(query, 'lat', { min: -90, max: 90 }, issues);
  const lng = readNumber(query, 'lng', { min: -180, max: 180 }, issues);
  const hasLat = query.lat !== undefined;
  const hasLng = query.lng !== undefined;
  if (hasLat !== hasLng) issues.add(hasLat ? 'lng' : 'lat', 'lat and lng must be given together');
  if (sort === 'distance' && (!hasLat || !hasLng)) {
    issues.add('sort', '"distance" needs the user location (lat and lng)');
  }
  issues.throwIfAny();

  const origin = lat !== undefined && lng !== undefined ? { lat, lng } : null;
  return { filters, page, limit, sort, origin };
}

// GET /api/jobs/summary and /api/jobs/filter-options — filters only.
export function parseFilterQuery(query) {
  const issues = createIssues();
  rejectUnknown(query, FILTER_PARAMS, issues);
  const filters = readFilters(query, issues);
  issues.throwIfAny();
  return { filters };
}

// GET /api/jobs/map — filters plus the visible map area and zoom.
export function parseMapQuery(query) {
  const issues = createIssues();
  rejectUnknown(query, [...FILTER_PARAMS, 'zoom'], issues);
  const filters = readFilters(query, issues);
  if (query.bbox === undefined) issues.add('bbox', 'is required');
  if (query.zoom === undefined) issues.add('zoom', 'is required');
  const zoom = readInteger(query, 'zoom', { min: MIN_ZOOM, max: MAX_ZOOM, fallback: undefined }, issues);
  issues.throwIfAny();
  return { filters, zoom };
}

// Stable public job id, e.g. "job-blr-12" (same pattern as the Job model).
export function parseJobId(value) {
  if (typeof value !== 'string' || !/^job-[a-z]+-\d+$/.test(value) || value.length > 64) {
    throw new ValidationError([{ param: 'jobId', message: 'must look like "job-<city>-<number>"' }]);
  }
  return value;
}
