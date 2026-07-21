import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from 'vitest';

// Control the hotspot source (analytics aggregation) and stub the fan-out
// side effects (notifications, socket broadcast) so we test the service's own
// dedup + level + persistence logic in isolation.
const { detectOutbreaks } = vi.hoisted(() => ({ detectOutbreaks: vi.fn() }));
vi.mock('../../src/services/analytics.service', () => ({ detectOutbreaks }));
vi.mock('../../src/services/notification.service', () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/config/socket', () => ({
  emitToRoom: vi.fn(),
  officerRoom: (region: string) => `officer:${region}`,
}));

import { connectTestDB, clearTestDB, disconnectTestDB } from '../setup/db';
import { OutbreakAlert } from '../../src/models/OutbreakAlert';
import { User } from '../../src/models/User';
import * as outbreakService from '../../src/services/outbreak.service';

beforeAll(async () => {
  await connectTestDB();
});
afterAll(async () => {
  await disconnectTestDB();
});
afterEach(async () => {
  await clearTestDB();
  vi.clearAllMocks();
});

// env default OUTBREAK_THRESHOLD=20; critical when count >= 20*4 = 80.
describe('detectAndAlert — persistence, level, dedup', () => {
  it('creates one alert per hotspot with the right level', async () => {
    detectOutbreaks.mockResolvedValue([
      { district: 'Gujarat', disease_label: 'Late Blight', count: 25 }, // high
      { district: 'Punjab', disease_label: 'Rice Blast', count: 90 }, // critical
    ]);

    const res = await outbreakService.detectAndAlert();
    expect(res).toEqual({ hotspots: 2, alertsCreated: 2 });

    const guj = await OutbreakAlert.findOne({ district: 'Gujarat' });
    const pun = await OutbreakAlert.findOne({ district: 'Punjab' });
    expect(guj?.level).toBe('high');
    expect(pun?.level).toBe('critical');
    expect(guj?.scan_count).toBe(25);
    expect(guj?.status).toBe('active');
    expect(guj?.window_days).toBe(7);
  });

  it('dedups a persistent hotspot within the 48h cooldown (no duplicate alert)', async () => {
    detectOutbreaks.mockResolvedValue([
      { district: 'Gujarat', disease_label: 'Late Blight', count: 30 },
    ]);

    const first = await outbreakService.detectAndAlert();
    expect(first.alertsCreated).toBe(1);

    // Same hotspot on the next run → deduped, no new alert.
    const second = await outbreakService.detectAndAlert();
    expect(second).toEqual({ hotspots: 1, alertsCreated: 0 });
    expect(await OutbreakAlert.countDocuments({ district: 'Gujarat' })).toBe(1);
  });

  it('raises a fresh alert once the previous one is older than the cooldown', async () => {
    // Seed an alert created 49h ago (outside the 48h cooldown).
    await OutbreakAlert.create({
      alert_id: 'alr_old',
      district: 'Gujarat',
      disease_label: 'Late Blight',
      scan_count: 22,
      level: 'high',
      status: 'active',
      window_days: 7,
      createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    });

    detectOutbreaks.mockResolvedValue([
      { district: 'Gujarat', disease_label: 'Late Blight', count: 40 },
    ]);
    const res = await outbreakService.detectAndAlert();
    expect(res.alertsCreated).toBe(1);
    expect(await OutbreakAlert.countDocuments({ district: 'Gujarat' })).toBe(2);
  });

  it('notifies active extension officers in the affected district', async () => {
    const notificationService = await import(
      '../../src/services/notification.service'
    );
    await User.create({
      user_id: 'usr_officer',
      name: 'Officer',
      email: 'officer@example.com',
      password: 'password123',
      role: 'extension_officer',
      region: 'Gujarat',
    });

    detectOutbreaks.mockResolvedValue([
      { district: 'Gujarat', disease_label: 'Late Blight', count: 30 },
    ]);
    await outbreakService.detectAndAlert();

    expect(notificationService.dispatch).toHaveBeenCalledTimes(1);
    expect(
      (notificationService.dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toMatchObject({ type: 'outbreak_alert' });
  });

  it('returns zero when there are no hotspots', async () => {
    detectOutbreaks.mockResolvedValue([]);
    expect(await outbreakService.detectAndAlert()).toEqual({
      hotspots: 0,
      alertsCreated: 0,
    });
  });
});

describe('listAlerts', () => {
  it('filters by region + status and paginates newest-first', async () => {
    await OutbreakAlert.create([
      { alert_id: 'a1', district: 'Gujarat', disease_label: 'X', scan_count: 30, level: 'high', status: 'active', window_days: 7 },
      { alert_id: 'a2', district: 'Punjab', disease_label: 'Y', scan_count: 30, level: 'high', status: 'active', window_days: 7 },
      { alert_id: 'a3', district: 'Gujarat', disease_label: 'Z', scan_count: 30, level: 'high', status: 'resolved', window_days: 7 },
    ]);

    const guj = await outbreakService.listAlerts({ page: 1, limit: 10, region: 'Gujarat' });
    expect(guj.total).toBe(2);

    const active = await outbreakService.listAlerts({ page: 1, limit: 10, status: 'active' });
    expect(active.total).toBe(2);

    const gujActive = await outbreakService.listAlerts({
      page: 1,
      limit: 10,
      region: 'Gujarat',
      status: 'active',
    });
    expect(gujActive.total).toBe(1);
    expect(gujActive.alerts[0].alert_id).toBe('a1');
  });
});
