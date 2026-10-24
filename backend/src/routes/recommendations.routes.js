import { Router } from 'express';
import {
  ensureRecommendation,
  getCurrentRecommendation,
  retryRecommendation,
} from '../services/recommendations.service.js';
import { requireDatabase, requireOwner } from '../middleware/owner.js';

// Job recommendations for the requesting owner (guests: X-Guest-Session).
//
//   POST /api/recommendations              { matchingProfile } → 202 new run / 200 existing
//   GET  /api/recommendations/current      status (+ items when completed), or { status: 'none' }
//   POST /api/recommendations/:id/retry    re-schedule a failed, retryable run
const router = Router();

router.use(requireDatabase, requireOwner);

router.post('/', async (req, res) => {
  const { created, recommendation } = await ensureRecommendation({
    owner: req.owner,
    matchingProfile: req.body?.matchingProfile,
  });
  res.status(created ? 202 : 200).json(recommendation);
});

router.get('/current', async (req, res) => {
  res.json(await getCurrentRecommendation({ owner: req.owner }));
});

router.post('/:recommendationId/retry', async (req, res) => {
  res.json(await retryRecommendation({ owner: req.owner, recommendationId: req.params.recommendationId }));
});

export default router;
