import 'dotenv/config';
import express from 'express';
import { connectDB, getDbState } from './config/db.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get('/health', (req, res) => {
  const database = getDbState();
  res.status(database === 'connected' ? 200 : 503).json({
    status: database === 'connected' ? 'ok' : 'degraded',
    database,
  });
});

// Connect to MongoDB first; only start accepting requests once connected.
async function start() {
  try {
    await connectDB();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
