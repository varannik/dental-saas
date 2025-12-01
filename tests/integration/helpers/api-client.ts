const API_URL = process.env.TEST_API_URL || 'http://localhost:3001';

export interface TestClient {
  get: (path: string) => Promise<TestResponse>;
  post: (path: string, body?: unknown) => Promise<TestResponse>;
  put: (path: string, body?: unknown) => Promise<TestResponse>;
  delete: (path: string) => Promise<TestResponse>;
  setAuthToken: (token: string) => void;
}

export interface TestResponse {
  status: number;
  data: Record<string, unknown>;
}

export function createTestClient(): TestClient {
  let authToken: string | null = null;

  const request = async (method: string, path: string, body?: unknown): Promise<TestResponse> => {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    return {
      status: response.status,
      data,
    };
  };

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),
    setAuthToken: (token) => {
      authToken = token;
    },
  };
}

