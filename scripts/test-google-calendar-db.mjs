import postgres from 'postgres';

if (
  !process.env.DATABASE_URL ||
  !process.env.DATABASE_URL.includes('zc10_calendar_test')
) {
  throw new Error(
    'Refusing to run Google Calendar DB tests outside zc10_calendar_test'
  );
}

const sql = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });
const ids = {
  userA: '10000000-0000-4000-8000-000000000001',
  userB: '10000000-0000-4000-8000-000000000002',
  accountA: '20000000-0000-4000-8000-000000000001',
  accountB: '20000000-0000-4000-8000-000000000002',
  appointmentA: '30000000-0000-4000-8000-000000000001',
  connectionA: '40000000-0000-4000-8000-000000000001',
  linkA: '50000000-0000-4000-8000-000000000001',
};

async function mustReject(label, tx, operation) {
  try {
    await tx.savepoint(operation);
  } catch (error) {
    if (error?.code === '23503' || error?.code === '23505') return;
    throw error;
  }
  throw new Error(`${label}_was_not_rejected`);
}

try {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO users (id, email, status) VALUES
      (${ids.userA}, 'zc10-a@example.test', 'active'),
      (${ids.userB}, 'zc10-b@example.test', 'active')`;
    await tx`INSERT INTO accounts (id, name, owner_user_id) VALUES
      (${ids.accountA}, 'ZC10 Tenant A', ${ids.userA}),
      (${ids.accountB}, 'ZC10 Tenant B', ${ids.userB})`;
    await tx`INSERT INTO appointments
      (id, account_id, title, start_time, end_time, timezone, all_day, all_day_start, all_day_end, organizer_user_id)
      VALUES (${ids.appointmentA}, ${ids.accountA}, 'Synthetic all-day', '2030-05-01T00:00:00Z', '2030-05-03T00:00:00Z', 'America/Cuiaba', true, '2030-05-01', '2030-05-03', ${ids.userA})`;
    await tx`INSERT INTO google_calendar_connections
      (id, account_id, user_id, credentials_encrypted, scopes, status, selected_calendar_id)
      VALUES (${ids.connectionA}, ${ids.accountA}, ${ids.userA}, 'synthetic-ciphertext', 'calendar.events', 'connected', 'synthetic-calendar')`;

    await mustReject(
      'cross_tenant_link',
      tx,
      (check) => check`INSERT INTO google_calendar_event_links
      (account_id, connection_id, appointment_id, google_calendar_id, google_event_id)
      VALUES (${ids.accountB}, ${ids.connectionA}, ${ids.appointmentA}, 'synthetic-calendar', 'event-cross-tenant')`
    );

    await tx`INSERT INTO google_calendar_event_links
      (id, account_id, connection_id, appointment_id, google_calendar_id, google_event_id, sync_state)
      VALUES (${ids.linkA}, ${ids.accountA}, ${ids.connectionA}, ${ids.appointmentA}, 'synthetic-calendar', 'event-1', 'synced')`;

    await mustReject(
      'duplicate_appointment_link',
      tx,
      (check) => check`INSERT INTO google_calendar_event_links
      (account_id, connection_id, appointment_id, google_calendar_id, google_event_id)
      VALUES (${ids.accountA}, ${ids.connectionA}, ${ids.appointmentA}, 'synthetic-calendar', 'event-2')`
    );

    await tx`INSERT INTO google_calendar_sync_jobs
      (account_id, connection_id, appointment_id, kind, dedupe_key)
      VALUES (${ids.accountA}, ${ids.connectionA}, ${ids.appointmentA}, 'push_upsert', 'synthetic-dedupe')`;
    await mustReject(
      'duplicate_job',
      tx,
      (check) => check`INSERT INTO google_calendar_sync_jobs
      (account_id, connection_id, appointment_id, kind, dedupe_key)
      VALUES (${ids.accountA}, ${ids.connectionA}, ${ids.appointmentA}, 'push_upsert', 'synthetic-dedupe')`
    );

    const [tenantIsolation] = await tx`SELECT count(*)::int AS count
      FROM google_calendar_event_links
      WHERE account_id = ${ids.accountB} AND connection_id = ${ids.connectionA}`;
    if (tenantIsolation.count !== 0)
      throw new Error('cross_tenant_row_visible');

    const [allDay] =
      await tx`SELECT all_day, all_day_start::text, all_day_end::text
      FROM appointments WHERE id = ${ids.appointmentA} AND account_id = ${ids.accountA}`;
    if (
      !allDay.all_day ||
      allDay.all_day_start !== '2030-05-01' ||
      allDay.all_day_end !== '2030-05-03'
    ) {
      throw new Error('all_day_roundtrip_failed');
    }

    throw Object.assign(new Error('ROLLBACK_TEST_DATA'), {
      rollbackOnly: true,
    });
  });
} catch (error) {
  if (!error?.rollbackOnly) throw error;
} finally {
  await sql.end();
}

console.log(
  JSON.stringify({
    tenancy: 'PASS',
    uniqueness: 'PASS',
    allDay: 'PASS',
    syntheticOnly: true,
  })
);
