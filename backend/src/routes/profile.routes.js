import { Router } from 'express';
import { getProfile, saveProfile } from '../services/profile.service.js';
import { requireDatabase, requireOwner } from '../middleware/owner.js';

// The owner's complete professional profile (guest or signed-in user).
//
//   GET /api/profile   → { profile | null, revision | null, updatedAt, resume | null }
//   PUT /api/profile   { profile, baseRevision } → same shape; 409 profile_conflict
//                      when the stored profile changed since baseRevision.
const router = Router();

router.use(requireDatabase, requireOwner);

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await getProfile(req.owner));
});

router.put('/', async (req, res) => {
  res.json(await saveProfile(req.owner, req.body));
});

export default router;
