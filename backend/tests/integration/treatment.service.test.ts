import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  vi,
} from 'vitest';

// Mock Redis (ioredis-mock supports get/setex/del/scanStream/pipeline) and the
// notification service (fire-and-forget side effect we don't want to run).
const { redisMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RedisMock = require('ioredis-mock');
  return { redisMock: new RedisMock() };
});
vi.mock('../../src/config/redis', () => ({ redis: redisMock }));
vi.mock('../../src/services/notification.service', () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
} from '../setup/db';
import { Treatment, REGION_ALL_INDIA } from '../../src/models/Treatment';
import { User } from '../../src/models/User';
import { TreatmentProposal } from '../../src/models/TreatmentProposal';
import * as treatmentService from '../../src/services/treatment.service';

let seq = 0;
async function makeTreatment(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return Treatment.create({
    treatment_id: `trt_test_${seq}`,
    disease_label: 'Late Blight',
    crop: 'tomato',
    regions: [REGION_ALL_INDIA],
    status: 'active',
    localized: {
      en: { summary: 'EN summary', prevention_text: 'EN prevention' },
      hi: { summary: 'HI summary', prevention_text: 'HI prevention' },
    },
    ...overrides,
  });
}

beforeAll(async () => {
  await connectTestDB();
});
afterAll(async () => {
  await disconnectTestDB();
});
beforeEach(async () => {
  await redisMock.flushall();
});
afterEach(async () => {
  await clearTestDB();
  vi.clearAllMocks();
});

describe('getForDisease — lookup, ranking, localization', () => {
  it('returns null and negative-caches when no treatment exists', async () => {
    const r = await treatmentService.getForDisease('Healthy', 'tomato', 'Gujarat', 'en');
    expect(r).toBeNull();
    // Negative sentinel is written under the region-specific key.
    expect(await redisMock.get('treatment:Healthy:tomato:Gujarat:en')).toBe(
      '__none__',
    );
  });

  it('prefers an exact regional match over the All-India fallback', async () => {
    await makeTreatment({
      treatment_id: 'trt_all',
      regions: [REGION_ALL_INDIA],
      localized: { en: { summary: 'all-india' } },
    });
    await makeTreatment({
      treatment_id: 'trt_guj',
      regions: ['Gujarat'],
      localized: { en: { summary: 'gujarat' } },
    });

    const r = await treatmentService.getForDisease('Late Blight', 'tomato', 'Gujarat', 'en');
    expect(r?.treatment_id).toBe('trt_guj');
    expect(r?.summary).toBe('gujarat');
  });

  it('falls back to All-India when the region has no specific match', async () => {
    await makeTreatment({ treatment_id: 'trt_all', regions: [REGION_ALL_INDIA] });
    const r = await treatmentService.getForDisease('Late Blight', 'tomato', 'Punjab', 'en');
    expect(r?.treatment_id).toBe('trt_all');
  });

  it('localizes to the requested language, falling back to English', async () => {
    await makeTreatment({
      regions: [REGION_ALL_INDIA],
      localized: { en: { summary: 'EN' }, hi: { summary: 'HI' } },
    });
    const hi = await treatmentService.getForDisease('Late Blight', 'tomato', undefined, 'hi');
    expect(hi?.summary).toBe('HI');
    // gu missing → falls back to en
    const gu = await treatmentService.getForDisease('Late Blight', 'tomato', undefined, 'gu');
    expect(gu?.summary).toBe('EN');
  });

  it('serves a second identical lookup from the positive cache (not Mongo)', async () => {
    const t = await makeTreatment({ regions: [REGION_ALL_INDIA] });
    const first = await treatmentService.getForDisease('Late Blight', 'tomato', undefined, 'en');
    expect(first?.treatment_id).toBe(t.treatment_id);

    // Delete the DB row — a cache hit must still return it.
    await Treatment.deleteMany({});
    const second = await treatmentService.getForDisease('Late Blight', 'tomato', undefined, 'en');
    expect(second?.treatment_id).toBe(t.treatment_id);
  });
});

describe('invalidateTreatmentCache', () => {
  it('drops every region×lang variant of a disease+crop', async () => {
    await makeTreatment({ regions: [REGION_ALL_INDIA] });
    await treatmentService.getForDisease('Late Blight', 'tomato', undefined, 'en');
    await treatmentService.getForDisease('Late Blight', 'tomato', undefined, 'hi');
    expect((await redisMock.keys('treatment:Late Blight:tomato:*')).length).toBe(2);

    await treatmentService.invalidateTreatmentCache('Late Blight', 'tomato');
    expect((await redisMock.keys('treatment:Late Blight:tomato:*')).length).toBe(0);
  });
});

describe('proposal workflow', () => {
  async function makeAgronomist() {
    return User.create({
      user_id: `usr_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      name: 'Dr Sharma',
      email: `agr_${seq++}@example.com`,
      password: 'password123',
      role: 'agronomist',
    });
  }

  it('rejects a new-treatment proposal missing disease_label/crop', async () => {
    const agr = await makeAgronomist();
    await expect(
      treatmentService.proposeTreatment({
        proposedByUserId: agr.user_id,
        proposedData: { source: 'x' },
      }),
    ).rejects.toMatchObject({ code: 'incomplete_proposal' });
  });

  it('approves a new proposal → creates an active treatment', async () => {
    const agr = await makeAgronomist();
    const proposal = await treatmentService.proposeTreatment({
      proposedByUserId: agr.user_id,
      proposedData: {
        disease_label: 'Early Blight',
        crop: 'tomato',
        regions: [REGION_ALL_INDIA],
      },
    });
    const { treatment } = await treatmentService.approveProposal(
      proposal.proposal_id,
      agr.user_id,
    );
    expect(treatment.disease_label).toBe('Early Blight');
    expect(treatment.status).toBe('active');

    const refetched = await TreatmentProposal.findOne({
      proposal_id: proposal.proposal_id,
    });
    expect(refetched?.status).toBe('approved');
  });

  it('double-approve → 409 proposal_not_pending', async () => {
    const agr = await makeAgronomist();
    const proposal = await treatmentService.proposeTreatment({
      proposedByUserId: agr.user_id,
      proposedData: { disease_label: 'Rust', crop: 'wheat' },
    });
    await treatmentService.approveProposal(proposal.proposal_id, agr.user_id);
    await expect(
      treatmentService.approveProposal(proposal.proposal_id, agr.user_id),
    ).rejects.toMatchObject({ code: 'proposal_not_pending' });
  });

  it('rejects with a reason and records it', async () => {
    const agr = await makeAgronomist();
    const proposal = await treatmentService.proposeTreatment({
      proposedByUserId: agr.user_id,
      proposedData: { disease_label: 'Rust', crop: 'wheat' },
    });
    const rejected = await treatmentService.rejectProposal(
      proposal.proposal_id,
      agr.user_id,
      'Insufficient citation',
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejection_reason).toBe('Insufficient citation');
  });
});
