// Integration tests for the All Jobs API against a real (in-memory) MongoDB
// loaded with the 500-job dataset. Atlas is never used. Expected values are
// computed independently in JavaScript from the same documents.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { Job } from '../src/models/job.model.js';
import { JOBS } from '../src/data/jobs.dataset.js';
import { toJobDocument } from '../src/seed/jobTransform.js';
import { buildJobFilter, parseListQuery } from '../src/services/jobQuery.js';
import { cellSizeDegrees } from '../src/services/jobs.service.js';
import { distanceKm } from '../src/utils/geo.js';

const DOCS = JOBS.map((job) => toJobDocument(job));
const INDIA = '68,6,98,37';
const HOUR = 3600000;

let mongod;
let server;
let base;

before(
  async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'spire_test' });
    await Job.createIndexes();
    await Job.insertMany(DOCS);
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  },
  { timeout: 600000 } // first run downloads the MongoDB binary
);

after(async () => {
  server?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

// GET helper: params is an object (arrays become repeated parameters).
async function get(path, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) =>
    (Array.isArray(value) ? value : [value]).forEach((item) => search.append(key, String(item)))
  );
  const query = search.toString();
  const response = await fetch(`${base}${path}${query ? `?${query}` : ''}`);
  return { status: response.status, body: await response.json() };
}

// --- independent reference implementation ---------------------------------------
const FIELD = { country: 'country', location: 'city', state: 'state', company: 'companyName', title: 'title', experience: 'experience' };
const AGING = { '24h': 24, '7d': 168, '30d': 720 };

function expected(params = {}, now = Date.now()) {
  const list = (value) => (value === undefined ? null : [].concat(value));
  return DOCS.filter((doc) => {
    if (params.q) {
      const text = params.q.toLowerCase();
      const fields = [doc.title, doc.companyName, doc.area, doc.city, doc.state, ...doc.requiredSkills];
      if (!fields.some((field) => field.toLowerCase().includes(text))) return false;
    }
    for (const [param, field] of Object.entries(FIELD)) {
      const values = list(params[param]);
      if (values && !values.includes(doc[field])) return false;
    }
    if (params.verified === 'true' && !doc.verified) return false;
    const hours = [params.aging && AGING[params.aging], params.last24h === 'true' && 24].filter(Boolean);
    if (hours.length && now - doc.postedAt.getTime() > Math.min(...hours) * HOUR) return false;
    if (params.bbox) {
      const [w, s, e, n] = params.bbox.split(',').map(Number);
      if (doc.longitude < w || doc.longitude > e || doc.latitude < s || doc.latitude > n) return false;
    }
    return true;
  });
}

const errorParams = (body) => body.details.map((detail) => detail.param).sort();

// --- list ------------------------------------------------------------------------

describe('GET /api/jobs (list)', () => {
  test('first page: 20 cards newest first, total 500, hasMore', async () => {
    const { status, body } = await get('/api/jobs');
    assert.equal(status, 200);
    assert.equal(body.items.length, 20);
    assert.deepEqual([body.page, body.limit, body.total, body.hasMore], [1, 20, 500, true]);
    const times = body.items.map((item) => Date.parse(item.postedAt));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
    const card = body.items[0];
    for (const field of ['id', 'title', 'companyName', 'company', 'area', 'city', 'location', 'salary', 'requiredSkills', 'postedAt', 'experience', 'jobType', 'latitude', 'longitude']) {
      assert.ok(card[field] !== undefined, `card is missing ${field}`);
    }
    assert.equal(card.description, undefined, 'cards must not carry the full description');
    assert.equal(card.location, `${card.city}, ${card.state}`);
  });

  test('walking every page returns all 500 jobs once, with no duplicates', async () => {
    const seen = [];
    for (let page = 1; ; page += 1) {
      const { body } = await get('/api/jobs', { page, limit: 50 });
      seen.push(...body.items.map((item) => item.id));
      assert.equal(body.hasMore, page < 10);
      if (!body.hasMore) break;
    }
    assert.equal(seen.length, 500);
    assert.equal(new Set(seen).size, 500);
  });

  test('adjacent pages never overlap, even for jobs with the same postedAt', async () => {
    const [one, two] = await Promise.all([get('/api/jobs', { page: 1, limit: 7 }), get('/api/jobs', { page: 2, limit: 7 })]);
    const ids = new Set(one.body.items.map((item) => item.id));
    two.body.items.forEach((item) => assert.ok(!ids.has(item.id)));
  });

  test('a page past the end is empty with hasMore false', async () => {
    const { status, body } = await get('/api/jobs', { page: 30, limit: 20 });
    assert.equal(status, 200);
    assert.deepEqual([body.items.length, body.total, body.hasMore], [0, 500, false]);
  });

  test('invalid page, limit, sort and unknown parameters → 400 listing each problem', async () => {
    const cases = [
      [{ page: 0 }, ['page']],
      [{ page: 'abc' }, ['page']],
      [{ page: '1.5' }, ['page']],
      [{ limit: 0 }, ['limit']],
      [{ limit: 51 }, ['limit']],
      [{ sort: 'fitment' }, ['sort']],
      [{ sort: 'distance' }, ['sort']],
      [{ lat: 12 }, ['lng']],
      [{ lat: 91, lng: 10 }, ['lat']],
      [{ page: [1, 2] }, ['page']],
      [{ foo: 1, limit: -5 }, ['foo', 'limit']],
      [{ q: 'x'.repeat(101) }, ['q']],
      [{ experience: '4-7 years' }, ['experience']],
      [{ aging: '1y' }, ['aging']],
      [{ verified: 'yes' }, ['verified']],
    ];
    for (const [params, bad] of cases) {
      const { status, body } = await get('/api/jobs', params);
      assert.equal(status, 400, JSON.stringify(params));
      assert.equal(body.error, 'invalid_request');
      assert.deepEqual(errorParams(body), bad, JSON.stringify(params));
    }
  });

  test('search matches title, company, area, city, state and skills (case-insensitive)', async () => {
    for (const q of ['react', 'BENGALURU', 'Northwind', 'Whitefield', 'Karnataka', 'kubernetes', 'Senior']) {
      const { body } = await get('/api/jobs', { q, limit: 50 });
      assert.equal(body.total, expected({ q }).length, q);
      assert.ok(body.total > 0, `"${q}" should match something`);
    }
  });

  test('search text is literal, never a regular expression', async () => {
    for (const q of ['.*', '(', 'C++', '$where', '[a-z]+']) {
      const { status, body } = await get('/api/jobs', { q });
      assert.equal(status, 200, q);
      assert.equal(body.total, expected({ q }).length, q);
    }
    assert.equal((await get('/api/jobs', { q: '.*' })).body.total, 0);
  });

  test('each filter, multi-value (OR) and combined (AND), matches the reference', async () => {
    const cases = [
      { country: 'India' },
      { location: 'Pune' },
      { location: ['Pune', 'Mumbai'] },
      { state: 'Maharashtra' },
      { company: 'Northwind Tech' },
      { title: 'React Developer' },
      { experience: ['0-1 years', '8-12 years'] },
      { verified: 'true' },
      { aging: '7d' },
      { aging: '30d' },
      { last24h: 'true' },
      { aging: '7d', last24h: 'true' },
      { location: 'Bengaluru', verified: 'true', experience: '5-8 years' },
      { q: 'python', state: ['Karnataka', 'Telangana'] },
      { location: 'Atlantis' },
    ];
    for (const params of cases) {
      const { status, body } = await get('/api/jobs', { ...params, limit: 50 });
      assert.equal(status, 200);
      const reference = expected(params);
      assert.equal(body.total, reference.length, JSON.stringify(params));
      const ids = new Set(reference.map((doc) => doc.jobId));
      body.items.forEach((item) => assert.ok(ids.has(item.id), `${item.id} should not match ${JSON.stringify(params)}`));
    }
  });

  test('last 24 hours returns exactly the jobs posted in the last 24 hours', async () => {
    const { body } = await get('/api/jobs', { last24h: 'true', limit: 50 });
    const now = Date.now();
    assert.ok(body.total > 0);
    body.items.forEach((item) => assert.ok(now - Date.parse(item.postedAt) <= 24 * HOUR));
    assert.equal(body.total, expected({ last24h: 'true' }).length);
  });

  test('distance sort: nearest first, with distanceKm from the user location', async () => {
    const origin = { lat: 18.52, lng: 73.85 }; // Pune
    const { body } = await get('/api/jobs', { sort: 'distance', ...origin, limit: 50 });
    assert.equal(body.total, 500);
    const distances = body.items.map((item) => item.distanceKm);
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
    const nearest = DOCS.map((doc) => distanceKm(origin.lat, origin.lng, doc.latitude, doc.longitude)).sort((a, b) => a - b);
    assert.ok(Math.abs(distances[0] - nearest[0]) < 0.05);
    assert.equal(body.items[0].city, 'Pune');
    const page2 = await get('/api/jobs', { sort: 'distance', ...origin, limit: 50, page: 2 });
    assert.ok(page2.body.items[0].distanceKm >= distances.at(-1));
  });

  test('other sorts add distanceKm when the location is known, and not otherwise', async () => {
    const withLocation = await get('/api/jobs', { lat: 12.97, lng: 77.59, limit: 3 });
    withLocation.body.items.forEach((item) => assert.equal(typeof item.distanceKm, 'number'));
    const without = await get('/api/jobs', { limit: 3 });
    without.body.items.forEach((item) => assert.equal(item.distanceKm, undefined));
  });

  test('"recommended" and "newest" use the same deterministic order (no AI ranking yet)', async () => {
    const [a, b] = await Promise.all([get('/api/jobs', { sort: 'recommended' }), get('/api/jobs', { sort: 'newest' })]);
    assert.deepEqual(a.body.items.map((item) => item.id), b.body.items.map((item) => item.id));
  });
});

// --- details -------------------------------------------------------------------

describe('GET /api/jobs/:jobId', () => {
  test('returns the full job with the formatted description', async () => {
    const { status, body } = await get('/api/jobs/job-pune-3');
    assert.equal(status, 200);
    const doc = DOCS.find((item) => item.jobId === 'job-pune-3');
    assert.equal(body.id, 'job-pune-3');
    assert.equal(body.company, doc.companyName);
    assert.equal(body.location, `${doc.city}, ${doc.state}`);
    assert.ok(body.description.includes("## What You'll Do"));
    doc.responsibilities.forEach((line) => assert.ok(body.description.includes(`- ${line}`)));
    assert.equal(body.applyUrl, doc.applyUrl);
    assert.deepEqual(body.requiredSkills, doc.requiredSkills);
    assert.equal(body.fitLabel, undefined);
  });

  test('malformed id → 400; unknown id → 404', async () => {
    for (const id of ['abc', 'job-BLR-1', 'job-blr-', "job-blr-1'"]) {
      const { status, body } = await get(`/api/jobs/${encodeURIComponent(id)}`);
      assert.equal(status, 400, id);
      assert.equal(body.error, 'invalid_request');
    }
    const missing = await get('/api/jobs/job-blr-9999');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'not_found');
  });
});

// --- summary and filter options -------------------------------------------------

describe('GET /api/jobs/summary and /filter-options', () => {
  test('summary total equals the list total and its bounds contain every match', async () => {
    for (const params of [{}, { location: 'Kochi' }, { verified: 'true', aging: '7d' }, { q: 'qa' }]) {
      const [summary, list] = await Promise.all([get('/api/jobs/summary', params), get('/api/jobs', params)]);
      assert.equal(summary.body.total, list.body.total);
      assert.equal(summary.body.companyCount, new Set(expected(params).map((doc) => doc.companyName)).size);
      const { west, south, east, north } = summary.body.bounds;
      expected(params).forEach((doc) => {
        assert.ok(doc.longitude >= west && doc.longitude <= east && doc.latitude >= south && doc.latitude <= north);
      });
    }
  });

  test('no matches → total 0 and bounds null', async () => {
    const { status, body } = await get('/api/jobs/summary', { location: 'Atlantis' });
    assert.equal(status, 200);
    assert.deepEqual(body, { total: 0, companyCount: 0, bounds: null });
  });

  test('filter options list real values with counts (count desc, then name)', async () => {
    const { body } = await get('/api/jobs/filter-options');
    assert.equal(body.total, 500);
    const cityCounts = {};
    DOCS.forEach((doc) => { cityCounts[doc.city] = (cityCounts[doc.city] ?? 0) + 1; });
    assert.deepEqual(Object.fromEntries(body.sections.location.map((o) => [o.value, o.count])), cityCounts);
    for (const section of ['country', 'location', 'state', 'company', 'title', 'experience']) {
      const options = body.sections[section];
      assert.equal(options.reduce((sum, option) => sum + option.count, 0), 500, section);
      for (let i = 1; i < options.length; i += 1) {
        const [a, b] = [options[i - 1], options[i]];
        assert.ok(a.count > b.count || (a.count === b.count && a.label.localeCompare(b.label) <= 0), section);
      }
    }
    assert.deepEqual(body.sections.aging.map((o) => o.value), ['24h', '7d', '30d']);
    assert.equal(body.sections.aging[0].count, expected({ aging: '24h' }).length);
    assert.equal(body.sections.aging[2].count, 500);
  });

  test('filter options honour the given filters (company counts within the results)', async () => {
    const params = { location: 'Hyderabad', verified: 'true' };
    const { body } = await get('/api/jobs/filter-options', params);
    const reference = expected(params);
    assert.equal(body.total, reference.length);
    assert.equal(body.sections.company.reduce((sum, option) => sum + option.count, 0), reference.length);
    assert.deepEqual(body.sections.location.map((o) => o.value), ['Hyderabad']);
  });
});

// --- map --------------------------------------------------------------------------

describe('GET /api/jobs/map', () => {
  // Reference grouping: jobs per cell, and offices (company + area + city) per cell.
  const cellsAt = (zoom, docs) => {
    const cell = cellSizeDegrees(zoom);
    const cells = new Map();
    docs.forEach((doc) => {
      const key = `${zoom}:${Math.floor((doc.longitude + 180) / cell)}:${Math.floor((doc.latitude + 90) / cell)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(doc);
    });
    return cells;
  };
  const officeKey = (doc) => `${doc.companyName}|${doc.area}|${doc.city}`;

  test('low zoom (all of India): numbered clusters of offices, counts add up to every job', async () => {
    const { status, body } = await get('/api/jobs/map', { bbox: INDIA, zoom: 5 });
    assert.equal(status, 200);
    assert.equal(body.total, 500);
    const sum = [...body.clusters, ...body.offices].reduce((total, m) => total + m.count, 0);
    assert.equal(sum, 500);
    assert.ok(body.clusters.length > 0 && body.clusters.length < 60, 'India at zoom 5 should be a handful of clusters');
    body.clusters.forEach((c) => {
      assert.ok(c.officeCount >= 2);
      assert.ok(c.latitude >= c.bounds.south && c.latitude <= c.bounds.north);
      assert.ok(c.longitude >= c.bounds.west && c.longitude <= c.bounds.east);
    });
  });

  test('every marker matches the reference grouping (offices per cell, counts, companies, centre)', async () => {
    for (const zoom of [6, 9, 12, 15]) {
      const params = { bbox: INDIA, verified: 'true' };
      const { body } = await get('/api/jobs/map', { ...params, zoom });
      const cells = cellsAt(zoom, expected(params));
      assert.equal(body.clusters.length + body.offices.length, cells.size, `zoom ${zoom}`);
      for (const marker of [...body.clusters, ...body.offices]) {
        const members = cells.get(marker.id);
        assert.ok(members, `unknown marker ${marker.id}`);
        assert.equal(marker.count, members.length);
        const avgLat = members.reduce((total, doc) => total + doc.latitude, 0) / members.length;
        assert.ok(Math.abs(marker.latitude - avgLat) < 1e-5);
        const offices = new Set(members.map(officeKey));
        if (marker.officeCount !== undefined) {
          assert.equal(marker.officeCount, offices.size);
          assert.equal(marker.companyCount, new Set(members.map((doc) => doc.companyName)).size);
        } else {
          assert.equal(offices.size, 1, 'an office marker holds one company office');
          assert.equal(marker.companyName, members[0].companyName);
          assert.equal(marker.area, members[0].area);
          assert.equal(marker.jobId, members.length === 1 ? members[0].jobId : undefined);
        }
      }
    }
  });

  test('zooming in splits clusters into company offices', async () => {
    const bbox = '77.45,12.75,77.85,13.15'; // Bengaluru
    const far = await get('/api/jobs/map', { bbox, zoom: 8 });
    const near = await get('/api/jobs/map', { bbox, zoom: 16 });
    assert.ok(far.body.clusters.length >= 1);
    assert.ok(near.body.offices.length > far.body.offices.length);
    assert.equal(near.body.total, far.body.total);
  });

  test('"View list" for a cluster (bbox) or an office (bbox + company) returns exactly its jobs', async () => {
    const { body } = await get('/api/jobs/map', { bbox: INDIA, zoom: 11, verified: 'true' });
    const cells = cellsAt(11, expected({ bbox: INDIA, verified: 'true' }));
    const sample = [...body.clusters.slice(0, 5), ...body.offices.filter((o) => o.count > 1).slice(0, 5)];
    assert.ok(sample.length > 0);
    for (const marker of sample) {
      const { west, south, east, north } = marker.bounds;
      const params = { bbox: `${west},${south},${east},${north}`, verified: 'true', limit: 50 };
      if (marker.companyName) params.company = marker.companyName;
      const list = await get('/api/jobs', params);
      assert.equal(list.body.total, marker.count, marker.id);
      assert.deepEqual(list.body.items.map((item) => item.id).sort(), cells.get(marker.id).map((doc) => doc.jobId).sort());
    }
  });

  test('a visible part of the map returns only the jobs in that part', async () => {
    const bbox = '72.6,18.8,73.2,19.4'; // Mumbai
    const { body } = await get('/api/jobs/map', { bbox, zoom: 9 });
    assert.equal(body.total, expected({ bbox }).length);
    assert.ok(body.total < 500 && body.total > 0);
  });

  test('map, list and summary agree for the same filters', async () => {
    const params = { bbox: INDIA, experience: '1-3 years', aging: '30d' };
    const [map, list, summary] = await Promise.all([
      get('/api/jobs/map', { ...params, zoom: 7 }),
      get('/api/jobs', params),
      get('/api/jobs/summary', params),
    ]);
    assert.equal(map.body.total, list.body.total);
    assert.equal(map.body.total, summary.body.total);
    assert.equal(map.body.total, expected(params).length);
  });

  test('bbox matching is exact at the edges (2dsphere pre-filter never drops jobs)', async () => {
    const doc = DOCS.find((item) => item.jobId === 'job-chennai-5');
    const { latitude: lat, longitude: lng } = doc;
    const boxes = [
      `${lng - 3},${lat},${lng + 3},${lat + 1}`, // job on the south edge of a wide box
      `${lng - 3},${lat - 1},${lng + 3},${lat}`, // on the north edge
      `${lng},${lat - 1},${lng + 2},${lat + 1}`, // on the west edge
      `${lng},${lat},${lng},${lat}`, // a single point
    ];
    for (const bbox of boxes) {
      const { body } = await get('/api/jobs/map', { bbox, zoom: 16 });
      assert.ok(body.offices.some((o) => o.jobId === 'job-chennai-5'), bbox);
      assert.equal(body.total, expected({ bbox }).length, bbox);
    }
  });

  test('empty viewport (open sea) → no markers', async () => {
    const { status, body } = await get('/api/jobs/map', { bbox: '60,-10,65,-5', zoom: 6 });
    assert.equal(status, 200);
    assert.deepEqual([body.total, body.clusters, body.offices], [0, [], []]);
  });

  test('filters that match nothing → empty map, not an error', async () => {
    const { status, body } = await get('/api/jobs/map', { bbox: INDIA, zoom: 5, company: 'No Such Co' });
    assert.equal(status, 200);
    assert.equal(body.total, 0);
  });

  test('invalid bbox and zoom → 400', async () => {
    const cases = [
      [{ zoom: 5 }, ['bbox']],
      [{ bbox: INDIA }, ['zoom']],
      [{ bbox: '1,2,3', zoom: 5 }, ['bbox']],
      [{ bbox: 'a,b,c,d', zoom: 5 }, ['bbox']],
      [{ bbox: '68,6,,37', zoom: 5 }, ['bbox']],
      [{ bbox: '-181,6,98,37', zoom: 5 }, ['bbox']],
      [{ bbox: '68,-91,98,37', zoom: 5 }, ['bbox']],
      [{ bbox: '98,6,68,37', zoom: 5 }, ['bbox']],
      [{ bbox: '68,37,98,6', zoom: 5 }, ['bbox']],
      [{ bbox: [INDIA, INDIA], zoom: 5 }, ['bbox']],
      [{ bbox: INDIA, zoom: 21 }, ['zoom']],
      [{ bbox: INDIA, zoom: -1 }, ['zoom']],
      [{ bbox: INDIA, zoom: 5.5 }, ['zoom']],
      [{ bbox: INDIA, zoom: 5, page: 1 }, ['page']],
    ];
    for (const [params, bad] of cases) {
      const { status, body } = await get('/api/jobs/map', params);
      assert.equal(status, 400, JSON.stringify(params));
      assert.deepEqual(errorParams(body), bad, JSON.stringify(params));
    }
  });

  test('the bbox query can use the 2dsphere index', async () => {
    const filter = buildJobFilter(parseListQuery({ bbox: '77.5,12.8,77.8,13.1' }).filters);
    const plan = JSON.stringify(await Job.find(filter).explain('queryPlanner'));
    assert.ok(plan.includes('geo_2dsphere'), 'expected the geo_2dsphere index in the query plan');
  });
});

// --- errors and stale data (these change the in-memory database; keep last) -----------

describe('failures and data with no recent jobs', () => {
  test('unknown routes → 404 JSON', async () => {
    const { status, body } = await get('/api/nothing');
    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });

  test('a database timeout → 503, without leaking error details', async () => {
    const original = Job.aggregate;
    Job.aggregate = () => ({
      option: () => Promise.reject(Object.assign(new Error('operation exceeded time limit'), { name: 'MongoServerError', code: 50 })),
    });
    try {
      const { status, body } = await get('/api/jobs/summary');
      assert.equal(status, 503);
      assert.equal(body.error, 'service_unavailable');
      assert.ok(!JSON.stringify(body).includes('time limit'));
    } finally {
      Job.aggregate = original;
    }
  });

  test('an unexpected error → 500', async () => {
    const original = Job.findOne;
    Job.findOne = () => { throw new TypeError('boom'); };
    try {
      const { status, body } = await get('/api/jobs/job-blr-1');
      assert.equal(status, 500);
      assert.equal(body.error, 'internal_error');
    } finally {
      Job.findOne = original;
    }
  });

  test('when no job is from the last 24 hours, the count is 0 (dates are not changed to fake it)', async () => {
    // Age every job by 40 days in the in-memory database only.
    await Job.updateMany(
      {},
      [{ $set: { postedAt: { $subtract: ['$postedAt', 40 * 24 * HOUR] } } }],
      { updatePipeline: true }
    );
    const [list, summary, options, map] = await Promise.all([
      get('/api/jobs', { last24h: 'true' }),
      get('/api/jobs/summary', { last24h: 'true' }),
      get('/api/jobs/filter-options'),
      get('/api/jobs/map', { bbox: INDIA, zoom: 5, last24h: 'true' }),
    ]);
    assert.deepEqual([list.status, list.body.total, list.body.items.length, list.body.hasMore], [200, 0, 0, false]);
    assert.equal(summary.body.total, 0);
    assert.deepEqual(options.body.sections.aging.map((o) => o.count), [0, 0, 0]);
    assert.equal(map.body.total, 0);
  });

  test('database disconnected → 503 on every jobs endpoint; /health reports it', async () => {
    await mongoose.disconnect();
    for (const path of ['/api/jobs', '/api/jobs/job-blr-1', '/api/jobs/summary', '/api/jobs/filter-options']) {
      const { status, body } = await get(path);
      assert.equal(status, 503, path);
      assert.equal(body.error, 'service_unavailable');
    }
    const map = await get('/api/jobs/map', { bbox: INDIA, zoom: 5 });
    assert.equal(map.status, 503);
    const health = await get('/health');
    assert.equal(health.status, 503);
    assert.equal(health.body.database, 'disconnected');
  });
});
