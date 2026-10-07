import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyFocus, setListed } from './context.js';
import { MemoryContextStore, ValkeyContextStore, type ContextStore } from './store.js';

let valkey: StartedTestContainer;
const stores: Record<string, () => ContextStore> = {};

beforeAll(async () => {
  valkey = await new GenericContainer('valkey/valkey:8.1').withExposedPorts(6379).start();
  const url = `redis://${valkey.getHost()}:${valkey.getMappedPort(6379)}`;
  stores.memory = () => new MemoryContextStore(1);
  stores.valkey = () => new ValkeyContextStore(url, 1);
}, 120_000);

afterAll(async () => {
  await valkey?.stop();
});

describe.each(['memory', 'valkey'])('%s context store', (name) => {
  const alice = { clinicId: 'c1', userId: 'alice' };
  const bob = { clinicId: 'c1', userId: 'bob' };

  it('starts empty, keeps one context per clinician, and applies changes', async () => {
    const store = stores[name]!();
    expect((await store.get(alice)).patientId).toBeNull();
    const updated = await store.update(alice, (context) =>
      applyFocus(context, { patientId: 'sara', sessionId: null, procedureId: null, tooth: '16' })
    );
    expect(updated).toMatchObject({ patientId: 'sara', tooth: '16', version: 1 });
    expect(await store.get(alice)).toEqual(updated);
    expect((await store.get(bob)).patientId).toBeNull();
    await store.close();
  });

  it('applies concurrent changes one after another, losing none', async () => {
    const store = stores[name]!();
    const key = { clinicId: 'c2', userId: 'busy' };
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.update(key, (context) =>
          setListed(context, { kind: 'n', ids: [...(context.lastListed?.ids ?? []), String(i)] })
        )
      )
    );
    expect((await store.get(key)).lastListed?.ids.sort((a, b) => Number(a) - Number(b))).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i))
    );
    await store.close();
  });

  it('forgets a context left unused past its time-to-live', async () => {
    const store = stores[name]!();
    const key = { clinicId: 'c3', userId: 'gone' };
    await store.update(key, (context) =>
      applyFocus(context, { patientId: 'sara', sessionId: null, procedureId: null, tooth: null })
    );
    await new Promise((done) => setTimeout(done, 1_500));
    expect((await store.get(key)).patientId).toBeNull();
    await store.close();
  });
});

describe('valkey context store across processes', () => {
  it('loses no change when two API processes update one context at once', async () => {
    const first = stores.valkey!();
    const second = stores.valkey!();
    const key = { clinicId: 'c4', userId: 'shared' };
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        (i % 2 ? first : second).update(key, (context) =>
          setListed(context, { kind: 'n', ids: [...(context.lastListed?.ids ?? []), String(i)] })
        )
      )
    );
    expect((await first.get(key)).lastListed?.ids).toHaveLength(30);
    await first.close();
    await second.close();
  });
});
