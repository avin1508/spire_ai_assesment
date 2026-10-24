import { Router } from 'express';
import { registerDevice, unregisterDevice } from '../services/push.service.js';
import { requireDatabase, requireOwner } from '../middleware/owner.js';

// Push notification devices of the owner (guest or signed-in user).
//
//   PUT    /api/devices  { token, platform: 'android' } → this device now belongs to the owner
//   DELETE /api/devices  { token }                      → removed if it belongs to the owner
const router = Router();

router.use(requireDatabase, requireOwner);

router.put('/', async (req, res) => {
  res.json(await registerDevice(req.owner, req.body));
});

router.delete('/', async (req, res) => {
  res.json(await unregisterDevice(req.owner, req.body));
});

export default router;
