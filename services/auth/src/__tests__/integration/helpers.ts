import { randomUUID } from 'node:crypto';

const DEFAULT_API_URL = 'http://localhost:4001';
const TEST_EMAIL_PREFIX = 'itest-';

export const DEMO_TENANT_ID = process.env.TEST_TENANT_ID ?? '11111111-1111-4111-8111-111111111111';
export const DEFAULT_PASSWORD = 'ValidPassword123!';

export interface TestResponse {
  status: number;
  data: unknown;
}

export class AuthTestClient {
  private authToken: string | null = null;
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.TEST_API_URL ?? DEFAULT_API_URL) {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  async get(path: string): Promise<TestResponse> {
    return this.request('GET', path);
  }

  async post(path: string, body?: unknown): Promise<TestResponse> {
    return this.request('POST', path, body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<TestResponse> {
    const headers: Record<string, string> = {
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  }
}

export async function setupIntegrationData(): Promise<void> {
  // Tests interact with a running auth container only.
  // Ensure TEST_TENANT_ID exists in the target DB before running.
  await Promise.resolve();
}

export async function clearIntegrationData(): Promise<void> {
  await Promise.resolve();
}

export function createTestEmail(): string {
  return `${TEST_EMAIL_PREFIX}${randomUUID()}@example.local`;
}
