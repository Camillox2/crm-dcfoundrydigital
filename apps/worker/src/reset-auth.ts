import { Redis } from 'ioredis';
import { acquireWorkerLease } from './worker-lease.js';
import { resetWhatsAppSession, whatsAppSessionDirectory } from './whatsapp-session.js';

// Stop the worker first. The shared lease also prevents reset during a live session.
const directory = process.env.WHATSAPP_SESSION_DIR || '/data/whatsapp-auth';
const id = process.argv[2] || '';
whatsAppSessionDirectory(directory, id);
if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required.');
const redis = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  connectTimeout: 5000,
  commandTimeout: 4000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});
redis.on('error', () => undefined);
try {
  await redis.connect();
  const lease = await acquireWorkerLease(redis, () => process.exit(1));
  try {
    lease.assertOwner();
    await resetWhatsAppSession(directory, id);
    console.log(
      'WhatsApp auth reset. Start the worker and connect again from the CRM. Business records were not changed.',
    );
  } finally {
    await lease.close();
  }
} finally {
  redis.disconnect();
}
