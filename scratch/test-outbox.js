require('dotenv').config({ path: '.env.local' });
const { pgTable, text, uuid, jsonb, timestamp, integer } = require('drizzle-orm/pg-core');
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Minimal schema for test
const automationEventsOutbox = pgTable('automation_events_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull(),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  depth: integer('depth').notNull().default(0),
  status: text('status').notNull().default('pending'),
});

async function main() {
  const event = {
    accountId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // Dummy UUID for constraint
    triggerType: 'contact.created',
    eventId: 'outbox-test-333',
    entityType: 'contact',
    entityId: 'test-contact-1',
    payload: { contact: { id: 'test-contact-1', name: 'Outbox Test' } },
    depth: 0
  };

  console.log('Inserting event directly into outbox...');
  try {
    await db.insert(automationEventsOutbox).values({
      accountId: event.accountId,
      eventId: event.eventId,
      eventType: event.triggerType,
      payload: event,
      depth: event.depth,
      status: 'pending'
    });
    console.log('Inserted. The worker should sweep this within 30s and push to Redis.');
  } catch (e) {
    console.log('Insert failed (maybe foreign key violation if accountId does not exist).', e.message);
  }

  process.exit(0);
}

main().catch(console.error);
