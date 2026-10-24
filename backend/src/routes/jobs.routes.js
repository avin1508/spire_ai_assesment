import { Router } from 'express';
import mongoose from 'mongoose';
import {
  parseFilterQuery,
  parseJobId,
  parseListQuery,
  parseMapQuery,
} from '../services/jobQuery.js';
import {
  getFilterOptions,
  getJob,
  getMapData,
  getSummary,
  listJobs,
} from '../services/jobs.service.js';
import { ServiceUnavailableError } from '../utils/httpErrors.js';

// All Jobs API. Public (guests can browse jobs); no authentication.
//
//   GET /api/jobs                 list page   (?page&limit&sort&lat&lng + filters)
//   GET /api/jobs/map             map markers (?bbox&zoom + filters)
//   GET /api/jobs/summary         { total, bounds } for the filters
//   GET /api/jobs/filter-options  values + counts per All Filters section
//   GET /api/jobs/:jobId          full job (Job Details)
//
// Filters: q, country, location (city), state, company, title, experience
// (repeatable), aging=24h|7d|30d, verified=true, last24h=true, bbox.
const router = Router();

// Fail fast with 503 instead of queueing queries while MongoDB is down.
router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    next(new ServiceUnavailableError('The jobs database is not connected'));
    return;
  }
  next();
});

router.get('/', async (req, res) => {
  res.json(await listJobs(parseListQuery(req.query)));
});

router.get('/map', async (req, res) => {
  res.json(await getMapData(parseMapQuery(req.query)));
});

router.get('/summary', async (req, res) => {
  res.json(await getSummary(parseFilterQuery(req.query)));
});

router.get('/filter-options', async (req, res) => {
  res.json(await getFilterOptions(parseFilterQuery(req.query)));
});

router.get('/:jobId', async (req, res) => {
  res.json(await getJob(parseJobId(req.params.jobId)));
});

export default router;
