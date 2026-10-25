import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { pushSenderFromKeyFile, setPushSender } from './services/push.service.js';

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
  // The API sends too: a device registering just after its recommendations
  // finished gets that notification (services/push.service.js registerDevice).
  const push = pushSenderFromKeyFile();
  setPushSender(push.sender);
  console.log(push.sender ? `Push notifications: enabled (Firebase project ${push.projectId})` : `Push notifications: disabled (${push.reason})`);

  createApp().listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
