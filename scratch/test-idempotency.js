require('dotenv').config({ path: '.env.local' });
const Redis = require('ioredis');

async function main() {
  const redis = new Redis('redis://localhost:6379');
  
  const event = {
    accountId: 'test-account-id',
    triggerType: 'contact.created',
    eventId: 'idem-test-999',
    entityType: 'contact',
    entityId: 'test-contact-1',
    payload: { contact: { id: 'test-contact-1', name: 'Idem Test' } },
    depth: 0,
    attempts: 0
  };

  console.log('Pushing event twice to zenith:automation:events...');
  await redis.lpush('zenith:automation:events', JSON.stringify(event));
  await redis.lpush('zenith:automation:events', JSON.stringify(event));

  console.log('Pushed. Check worker logs and automation runs in DB to verify only 1 run was created and 2nd was skipped/ACKed.');
  process.exit(0);
}

main().catch(console.error);
