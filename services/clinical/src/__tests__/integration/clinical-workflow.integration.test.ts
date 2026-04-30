import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabase } from '@saas/config';

import { buildClinicalServiceServer } from '../../app.js';
import {
  assertClinicalIntegrationDatabaseReady,
  assertInjectStatus,
  DEMO_TENANT_ID,
  ensureClinicalWorkflowPrimaries,
  issueClinicalAccessToken,
} from './helpers.js';

const maybeDescribe = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

maybeDescribe('clinical API workflow (Phase 2 dental core)', () => {
  const app = buildClinicalServiceServer();
  let locationId: string;
  let providerUserId: string;

  beforeAll(async () => {
    await assertClinicalIntegrationDatabaseReady();
    const primaries = await ensureClinicalWorkflowPrimaries(DEMO_TENANT_ID);
    locationId = primaries.locationId;
    providerUserId = primaries.userId;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('patient → encounter → chart entry → clinical note → treatment plan + item', async () => {
    const token = issueClinicalAccessToken({
      userId: providerUserId,
      tenantId: DEMO_TENANT_ID,
    });
    const auth = { authorization: `Bearer ${token}` };
    const suffix = randomUUID().slice(0, 8);

    const createPatient = await app.inject({
      method: 'POST',
      url: '/patients',
      headers: auth,
      payload: {
        firstName: 'John',
        lastName: `Doe-${suffix}`,
        dob: '1985-03-15',
        contactEmail: `john.doe.${suffix}@example.local`,
        phoneMobile: '+1234567890',
      },
    });
    assertInjectStatus(createPatient, 201, 'POST /patients');
    const patientBody = createPatient.json() as { patient: { id: string } };
    const patientId = patientBody.patient.id;
    expect(patientId).toMatch(/^[0-9a-f-]{36}$/i);

    const scheduledStartAt = new Date().toISOString();
    const createEncounter = await app.inject({
      method: 'POST',
      url: '/encounters',
      headers: auth,
      payload: {
        patientId,
        locationId,
        encounterType: 'EXAM',
        scheduledStartAt,
      },
    });
    assertInjectStatus(createEncounter, 201, 'POST /encounters');
    const encounterBody = createEncounter.json() as { encounter: { id: string } };
    const encounterId = encounterBody.encounter.id;

    // Chart API accepts a single surface enum per row (M|O|D|B|L|I), not combined "MO" like the Phase-2 curl example.
    const chartEntry = await app.inject({
      method: 'POST',
      url: `/patients/${patientId}/chart/entries`,
      headers: auth,
      payload: {
        toothNumber: '3',
        surface: 'M',
        condition: 'CARIES',
        cdtCode: 'D0220',
        encounterId,
      },
    });
    assertInjectStatus(chartEntry, 201, 'POST /patients/:id/chart/entries');

    const createNote = await app.inject({
      method: 'POST',
      url: `/encounters/${encounterId}/notes`,
      headers: auth,
      payload: {
        noteType: 'SOAP',
        content:
          'S: Patient reports pain in upper right quadrant.\nO: Caries on tooth #3 MO surface.\nA: Caries D0220.\nP: Recommend resin-based composite D2391.',
      },
    });
    assertInjectStatus(createNote, 201, 'POST /encounters/:id/notes');
    const noteBody = createNote.json() as { note: { id: string; noteType: string } };
    expect(noteBody.note.noteType).toBe('SOAP');

    const createPlan = await app.inject({
      method: 'POST',
      url: `/patients/${patientId}/treatment-plans`,
      headers: auth,
      payload: {
        title: 'Restorative phase 1',
      },
    });
    assertInjectStatus(createPlan, 201, 'POST /patients/:id/treatment-plans');
    const planBody = createPlan.json() as { plan: { id: string } };
    const planId = planBody.plan.id;

    // Items are added via /treatment-plans/:planId/items (create body does not accept inline items).
    const addItem = await app.inject({
      method: 'POST',
      url: `/treatment-plans/${planId}/items`,
      headers: auth,
      payload: {
        cdtCode: 'D2391',
        toothNumber: '3',
        surface: 'MO',
        estimatedFee: 250,
        phase: 1,
      },
    });
    assertInjectStatus(addItem, 201, 'POST /treatment-plans/:id/items');

    const chartRead = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}/chart`,
      headers: auth,
    });
    assertInjectStatus(chartRead, 200, 'GET /patients/:id/chart');
    const chartJson = chartRead.json() as {
      chart: { entries: Array<{ toothNumber: string; cdtCode?: string | null }> };
    };
    expect(
      chartJson.chart.entries.some((e) => e.toothNumber === '3' && e.cdtCode === 'D0220')
    ).toBe(true);

    const planRead = await app.inject({
      method: 'GET',
      url: `/treatment-plans/${planId}`,
      headers: auth,
    });
    assertInjectStatus(planRead, 200, 'GET /treatment-plans/:id');
    const planWithItems = planRead.json() as {
      items: Array<{ cdtCode: string; toothNumber?: string | null }>;
    };
    expect(planWithItems.items.some((i) => i.cdtCode === 'D2391' && i.toothNumber === '3')).toBe(
      true
    );
  });
});
