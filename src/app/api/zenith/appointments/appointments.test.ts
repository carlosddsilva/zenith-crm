import { describe, it, expect, vi } from 'vitest';
import { POST, GET } from './route';
import * as eventBus from '@/lib/events/bus';

vi.mock('@/lib/google-calendar/queue', () => ({
  enqueueAppointmentSync: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    transaction: vi.fn(async (callback) => callback({
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{
            id: 'apt-1',
            title: 'Meeting',
            description: null,
            status: 'scheduled',
            timezone: 'UTC',
            allDay: false,
            allDayStart: null,
            allDayEnd: null,
            startTime: new Date('2030-01-01T10:00:00.000Z'),
            endTime: new Date('2030-01-01T11:00:00.000Z'),
            updatedAt: new Date('2030-01-01T09:00:00.000Z'),
          }]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{
          id: 'apt-1',
          title: 'Meeting',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
        }])
      }))
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn().mockResolvedValue([])
            }))
          }))
        }))
      }))
    })),
  },
}));

vi.mock('@/lib/auth/zenith-account', () => ({
  requireZenithRole: vi.fn().mockResolvedValue({ accountId: 'acc-1', userId: 'user-1' }),
}));

describe('Appointments CRUD', () => {
  it('creates an appointment', async () => {
    vi.spyOn(eventBus, 'publishEvent').mockResolvedValue();

    const req = new Request('http://localhost/api/zenith/appointments', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Meeting',
        startTime: '2030-01-01T10:00:00.000Z',
        endTime: '2030-01-01T11:00:00.000Z',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('apt-1');
    expect(eventBus.publishEvent).toHaveBeenCalled();
  });

  it('gets appointments', async () => {
    const req = new Request('http://localhost/api/zenith/appointments?contactId=contact-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
