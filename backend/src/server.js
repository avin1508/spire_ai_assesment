import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';

const PORT = process.env.PORT || 5000;

// Connect to MongoDB and Redis first; only start accepting requests once connected.
async function start() {
  try {
    await connectDB();
    await connectRedis();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  createApp().listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
