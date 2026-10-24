// Database queries behind the All Jobs API. Every function takes parsed,
// validated parameters (services/jobQuery.js) and returns plain JSON.

import { Job } from '../models/job.model.js';
import { CARD_FIELDS, toFrontendJob, toJobCard } from '../seed/jobTransform.js';
import { AGING_HOURS, LIST_FILTERS, buildJobFilter } from './jobQuery.js';
import { NotFoundError } from '../utils/httpErrors.js';
import { distanceKm } from '../utils/geo.js';

// A slow query fails (→ 503) instead of holding the request open.
export const QUERY_TIME_LIMIT_MS = 8000;

const CARD_PROJECTION = Object.fromEntries([...CARD_FIELDS.map((field) => [field, 1]), ['_id', 1]]);
// Deterministic order: ties on postedAt are broken by _id, so pages never overlap.
const NEWEST_FIRST = { postedAt: -1, _id: -1 };

const round6 = (value) => Math.round(value * 1e6) / 1e6;

// --- List ----------------------------------------------------------------------

// One page of job cards plus pagination metadata.
// "recommended" has no ranking yet (AI recommendations come later), so it
// uses the same deterministic newest-first order as "newest".
export async function listJobs({ filters, page, limit, sort, origin }, now = Date.now()) {
  const filter = buildJobFilter(filters, now);
  const skip = (page - 1) * limit;

  const docsPromise =
    sort === 'distance'
      ? Job.aggregate([
          {
            $geoNear: {
              near: { type: 'Point', coordinates: [origin.lng, origin.lat] },
              distanceField: 'distanceMeters',
              key: 'geo',
              spherical: true,
              // The exact latitude/longitude ranges already cover any bbox.
              query: withoutGeo(filter),
            },
          },
          { $sort: { distanceMeters: 1, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: { ...CARD_PROJECTION, distanceMeters: 1 } },
        ]).option({ maxTimeMS: QUERY_TIME_LIMIT_MS })
      : Job.find(filter, CARD_PROJECTION)
          .sort(NEWEST_FIRST)
          .skip(skip)
          .limit(limit)
          .lean()
          .maxTimeMS(QUERY_TIME_LIMIT_MS);

  const [docs, total] = await Promise.all([
    docsPromise,
    Job.countDocuments(filter).maxTimeMS(QUERY_TIME_LIMIT_MS),
  ]);

  const items = docs.map((doc) => {
    const card = toJobCard(doc);
    if (doc.distanceMeters !== undefined) card.distanceKm = doc.distanceMeters / 1000;
    else if (origin) card.distanceKm = distanceKm(origin.lat, origin.lng, doc.latitude, doc.longitude);
    return card;
  });

  return { items, page, limit, total, hasMore: skip + items.length < total };
}

function withoutGeo(filter) {
  const { geo, ...rest } = filter;
  return rest;
}

// --- Details -------------------------------------------------------------------

export async function getJob(jobId) {
  const doc = await Job.findOne({ jobId }).lean().maxTimeMS(QUERY_TIME_LIMIT_MS);
  if (!doc) throw new NotFoundError(`Job ${jobId} was not found`);
  return toFrontendJob(doc);
}

// --- Summary (result count + extent) --------------------------------------------

// Total matching jobs, how many companies they belong to, and the rectangle
// that contains them (null when none), for "View jobs (N)", "View companies
// (N)", "Show N jobs" and fitting the map to the results.
export async function getSummary({ filters }, now = Date.now()) {
  const [row] = await Job.aggregate([
    { $match: buildJobFilter(filters, now) },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        west: { $min: '$longitude' },
        south: { $min: '$latitude' },
        east: { $max: '$longitude' },
        north: { $max: '$latitude' },
        companies: { $addToSet: '$companyName' },
      },
    },
    { $set: { companyCount: { $size: '$companies' } } },
    { $unset: 'companies' },
  ]).option({ maxTimeMS: QUERY_TIME_LIMIT_MS });

  if (!row) return { total: 0, companyCount: 0, bounds: null };
  const { total, companyCount, west, south, east, north } = row;
  return { total, companyCount, bounds: { west, south, east, north } };
}

// --- Filter options ----------------------------------------------------------------

const AGING_LABELS = { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' };

// For each All Filters section: the values present in the jobs matching
// `filters`, with job counts (count desc, then name). Aging lists all three
// buckets, including those with 0 jobs.
export async function getFilterOptions({ filters }, now = Date.now()) {
  const facets = Object.fromEntries(
    Object.entries(LIST_FILTERS).map(([section, field]) => [section, [{ $sortByCount: `$${field}` }]])
  );
  facets.aging = [
    {
      $group: {
        _id: null,
        ...Object.fromEntries(
          Object.entries(AGING_HOURS).map(([key, hours]) => [
            key,
            { $sum: { $cond: [{ $gte: ['$postedAt', new Date(now - hours * 3600000)] }, 1, 0] } },
          ])
        ),
      },
    },
  ];
  facets.total = [{ $count: 'count' }];

  const [result] = await Job.aggregate([
    { $match: buildJobFilter(filters, now) },
    { $facet: facets },
  ]).option({ maxTimeMS: QUERY_TIME_LIMIT_MS });

  const sections = {};
  Object.keys(LIST_FILTERS).forEach((section) => {
    sections[section] = result[section]
      .filter((row) => row._id !== null && row._id !== '')
      .map((row) => ({ value: row._id, label: row._id, count: row.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  });
  const agingRow = result.aging[0] ?? {};
  sections.aging = Object.keys(AGING_HOURS).map((key) => ({
    value: key,
    label: AGING_LABELS[key],
    count: agingRow[key] ?? 0,
  }));

  return { total: result.total[0]?.count ?? 0, sections };
}

// --- Map ------------------------------------------------------------------------

// Grid cell size: about CELL_PX screen pixels at the given zoom (256 px tiles).
export const CELL_PX = 64;

export const cellSizeDegrees = (zoom) => (360 / 2 ** zoom) * (CELL_PX / 256);

// Markers for the visible map area (`filters.bbox`) at `zoom`.
//
// Jobs are grouped by office (same company, area and city) and by grid cell
// (about CELL_PX on screen, by each job's own position). Per cell:
//   - one office → an "office" marker: the company's job count there, shown as
//     a white bubble with the company name (jobId is set when it is one job);
//   - several offices → a "cluster" marker: shown as a numbered pin with the
//     number of offices; zooming in splits it.
// Both carry the exact bounds of their jobs: listing with bbox = bounds
// (plus company for an office) returns exactly the marker's jobs.
export async function getMapData({ filters, zoom }, now = Date.now()) {
  const cell = cellSizeDegrees(zoom);
  const cells = await Job.aggregate([
    { $match: buildJobFilter(filters, now) },
    // 1. Jobs → offices within each cell.
    {
      $group: {
        _id: {
          x: { $floor: { $divide: [{ $add: ['$longitude', 180] }, cell] } },
          y: { $floor: { $divide: [{ $add: ['$latitude', 90] }, cell] } },
          company: '$companyName',
          area: '$area',
          city: '$city',
        },
        count: { $sum: 1 },
        latSum: { $sum: '$latitude' },
        lngSum: { $sum: '$longitude' },
        west: { $min: '$longitude' },
        south: { $min: '$latitude' },
        east: { $max: '$longitude' },
        north: { $max: '$latitude' },
        jobId: { $min: '$jobId' },
      },
    },
    // 2. Offices → cells.
    {
      $group: {
        _id: { x: '$_id.x', y: '$_id.y' },
        count: { $sum: '$count' },
        latSum: { $sum: '$latSum' },
        lngSum: { $sum: '$lngSum' },
        west: { $min: '$west' },
        south: { $min: '$south' },
        east: { $max: '$east' },
        north: { $max: '$north' },
        officeCount: { $sum: 1 },
        companies: { $addToSet: '$_id.company' },
        office: { $first: { company: '$_id.company', area: '$_id.area', city: '$_id.city', jobId: '$jobId' } },
      },
    },
    { $set: { companyCount: { $size: '$companies' } } },
    { $unset: 'companies' },
    { $sort: { '_id.y': 1, '_id.x': 1 } },
  ]).option({ maxTimeMS: QUERY_TIME_LIMIT_MS });

  const clusters = [];
  const offices = [];
  let total = 0;
  cells.forEach((row) => {
    total += row.count;
    const marker = {
      id: `${zoom}:${row._id.x}:${row._id.y}`,
      latitude: round6(row.latSum / row.count),
      longitude: round6(row.lngSum / row.count),
      count: row.count,
      bounds: { west: row.west, south: row.south, east: row.east, north: row.north },
    };
    if (row.officeCount === 1) {
      offices.push({
        ...marker,
        companyName: row.office.company,
        area: row.office.area,
        city: row.office.city,
        ...(row.count === 1 ? { jobId: row.office.jobId } : {}),
      });
    } else {
      clusters.push({ ...marker, officeCount: row.officeCount, companyCount: row.companyCount });
    }
  });

  return { zoom, total, clusters, offices };
}
