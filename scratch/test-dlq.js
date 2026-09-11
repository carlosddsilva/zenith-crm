require('dotenv').config({ path: '.env.local' });
const Redis = require('ioredis');

async function main() {
  const redis = new Redis('redis://localhost:6379');
  
  const event = {
    accountId: 'test-account-id',
    triggerType: 'contact.created',
    eventId: 'dlq-test-222',
    entityType: 'contact',
    entityId: 'test-contact-1',
    // Missing payload will cause our current dispatcher to throw 400 (or if we intentionally break something),
    // Wait, the dispatcher returns 400, which is NOT res.ok, so worker will retry.
    // Let's force a failure by omitting required fields or sending depth > 3.
    // Wait, depth > 3 returns 400 -> res.ok is false -> retries.
    depth: 4, 
    attempts: 0
  };

  console.log('Pushing event that will fail 3 times and go to DLQ...');
  await redis.lpush('zenith:automation:events', JSON.stringify(event));

  console.log('Pushed. Check worker logs to see it retry 3 times then moved to zenith:automation:events:dead.');
  process.exit(0);
}

main().catch(console.error);
