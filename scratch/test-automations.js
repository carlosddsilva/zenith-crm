require('dotenv').config({ path: '.env.local' });
const { redis } = require('./src/lib/redis');
const fetch = require('node-fetch');

async function testAutomations() {
  console.log('Testing Automations Engine...');
  
  // Create test event payload
  const event = {
    accountId: 'test-account-id',
    triggerType: 'contact.created',
    eventId: 'duplicate-test-123',
    entityType: 'contact',
    entityId: 'test-contact-1',
    payload: { contact: { id: 'test-contact-1', name: 'Test' } },
    depth: 0
  };

  // 1. Test durable dispatch (Redis)
  console.log('Pushing event to redis queue...');
  await redis.rpush('zenith:automation:events', JSON.stringify(event));
  console.log('Event pushed successfully.');
  
  // 2. We can simulate the worker processing the event
  console.log('Simulating worker HTTP dispatch...');
  const res = await fetch('http://localhost:3000/api/zenith/workers/automation-dispatcher', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zenith-worker-token': 'dev-secret'
    },
    body: JSON.stringify(event)
  });
  console.log(`Worker dispatch HTTP status: ${res.status}`);
  
  // Wait a bit
  await new Promise(r => setTimeout(r, 1000));
  
  // 3. Test loop prevention
  const loopedEvent = {
    ...event,
    eventId: 'loop-test-123',
    depth: 3 // Max depth
  };
  
  const resLoop = await fetch('http://localhost:3000/api/zenith/workers/automation-dispatcher', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zenith-worker-token': 'dev-secret'
    },
    body: JSON.stringify(loopedEvent)
  });
  console.log(`Loop prevention dispatch HTTP status: ${resLoop.status}`);
  const loopBody = await resLoop.text();
  console.log(`Loop prevention body: ${loopBody}`);

  process.exit(0);
}

testAutomations().catch(console.error);
