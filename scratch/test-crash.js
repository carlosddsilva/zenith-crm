require('dotenv').config({ path: '.env.local' });
const Redis = require('ioredis');

async function main() {
  const redis = new Redis('redis://localhost:6379');
  
  const event = {
    accountId: 'test-account-id',
    triggerType: 'contact.created',
    eventId: 'crash-test-111',
    entityType: 'contact',
    entityId: 'test-contact-1',
    payload: { contact: { id: 'test-contact-1', name: 'Crash Test' } },
    depth: 0,
    attempts: 0
  };

  console.log('Pushing event directly to zenith:automation:events:processing...');
  // This simulates an event that was popped by worker, but worker crashed before finishing
  await redis.lpush('zenith:automation:events:processing', JSON.stringify(event));

  console.log('Pushed to processing queue. Please restart the worker to verify it reclaims this event on startup sweep.');
  process.exit(0);
}

main().catch(console.error);
