import 'dotenv/config';
import express from 'express';
import { connectDB, getDbState } from './config/db.js';
import { connectRedis, getRedisState } from './config/redis.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// 200 when MongoDB is connected and Redis is connected (or not configured).
app.get('/health', (req, res) => {
  const database = getDbState();
  const redis = getRedisState();
  const healthy = database === 'connected' && (redis === 'connected' || redis === 'not_configured');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    database,
    redis,
  });
});

// Connect to MongoDB and Redis first; only start accepting requests once connected.
async function start() {
  try {
    await connectDB();
    await connectRedis();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
