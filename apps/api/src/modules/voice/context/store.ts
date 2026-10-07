import type { VoiceContext } from '@dental/contracts';
import { Valkey } from 'iovalkey';
import { emptyContext } from './context.js';

/**
 * Where voice contexts live (V3). One context per clinician per clinic, expiring after a
 * period without use, so a restart or a forgotten tablet loses at most an unconfirmed proposal.
 * Every change is a read-modify-write applied atomically.
 */

export interface ContextKey {
  clinicId: string;
  userId: string;
}

export interface ContextStore {
  get(key: ContextKey): Promise<VoiceContext>;
  /** Applies the change atomically and returns the new context. */
  update(key: ContextKey, change: (context: VoiceContext) => VoiceContext): Promise<VoiceContext>;
  /** Whether the backing service answers, for /readyz. */
  ping?(): Promise<boolean>;
  close(): Promise<void>;
}

/** Two hours without use; then the clinician starts from what is on screen again. */
export const CONTEXT_TTL_SECONDS = 2 * 60 * 60;

const keyOf = (key: ContextKey) => `voice:context:${key.clinicId}:${key.userId}`;

/**
 * Runs the changes to one context one at a time within this process. Without it, concurrent
 * updates interleave across awaits and overwrite each other; with it, Valkey's optimistic
 * retry only has to cover other processes.
 */
class KeyedQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}

/** For tests and for development without Valkey. Not shared between processes. */
export class MemoryContextStore implements ContextStore {
  private readonly contexts = new Map<string, { context: VoiceContext; expires: number }>();
  private readonly queue = new KeyedQueue();

  constructor(private readonly ttlSeconds = CONTEXT_TTL_SECONDS) {}

  async get(key: ContextKey) {
    const hit = this.contexts.get(keyOf(key));
    return hit && hit.expires > Date.now() ? hit.context : emptyContext();
  }

  update(key: ContextKey, change: (context: VoiceContext) => VoiceContext) {
    return this.queue.run(keyOf(key), async () => {
      const next = change(await this.get(key));
      this.contexts.set(keyOf(key), {
        context: next,
        expires: Date.now() + this.ttlSeconds * 1000,
      });
      return next;
    });
  }

  async close() {
    this.contexts.clear();
  }
}

const MAX_ATTEMPTS = 20;
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export class ContextConflictError extends Error {}

/** Valkey, with optimistic transactions: WATCH, read, compute, MULTI SET, retry on conflict. */
export class ValkeyContextStore implements ContextStore {
  private readonly client: Valkey;
  private readonly queue = new KeyedQueue();

  constructor(
    url: string,
    private readonly ttlSeconds = CONTEXT_TTL_SECONDS
  ) {
    this.client = new Valkey(url, { maxRetriesPerRequest: 2 });
    // Connection errors surface on the calls that need the connection.
    this.client.on('error', () => undefined);
  }

  async get(key: ContextKey) {
    const raw = await this.client.get(keyOf(key));
    return raw ? (JSON.parse(raw) as VoiceContext) : emptyContext();
  }

  update(key: ContextKey, change: (context: VoiceContext) => VoiceContext) {
    return this.queue.run(keyOf(key), () => this.transact(keyOf(key), change));
  }

  private async transact(id: string, change: (context: VoiceContext) => VoiceContext) {
    // A connection of its own, because WATCH belongs to a connection.
    const connection = this.client.duplicate();
    connection.on('error', () => undefined);
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        await connection.watch(id);
        const raw = await connection.get(id);
        const next = change(raw ? (JSON.parse(raw) as VoiceContext) : emptyContext());
        const result = await connection
          .multi()
          .set(id, JSON.stringify(next), 'EX', this.ttlSeconds)
          .exec();
        // null: another process changed the key after WATCH; wait a little, then recompute.
        if (result !== null) return next;
        await sleep(Math.random() * 10 * attempt);
      }
      throw new ContextConflictError('the voice context kept changing; try again');
    } finally {
      await connection.quit().catch(() => connection.disconnect());
    }
  }

  async ping() {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close() {
    await this.client.quit();
  }
}
