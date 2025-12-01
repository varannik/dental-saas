import type { User, Subscription, Plan, AuthTokens } from '@saas/types';

export interface SaaSClientConfig {
  apiKey?: string;
  baseUrl: string;
  timeout?: number;
  retries?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export class SaaSClient {
  private config: SaaSClientConfig;
  private accessToken: string | null = null;

  public auth: AuthClient;
  public users: UsersClient;
  public subscriptions: SubscriptionsClient;

  constructor(config: SaaSClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config,
    };

    this.auth = new AuthClient(this);
    this.users = new UsersClient(this);
    this.subscriptions = new SubscriptionsClient(this);
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.accessToken && { Authorization: `Bearer ${this.accessToken}` }),
      ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message);
    }

    return response.json();
  }
}

class AuthClient {
  constructor(private client: SaaSClient) {}

  async login(credentials: LoginCredentials): Promise<{ user: User; tokens: AuthTokens }> {
    const result = await this.client.request<{ user: User; accessToken: string; refreshToken: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      }
    );
    this.client.setAccessToken(result.accessToken);
    return {
      user: result.user,
      tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken },
    };
  }

  async register(data: RegisterData): Promise<{ user: User; tokens: AuthTokens }> {
    const result = await this.client.request<{ user: User; accessToken: string; refreshToken: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    this.client.setAccessToken(result.accessToken);
    return {
      user: result.user,
      tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken },
    };
  }

  async logout(): Promise<void> {
    await this.client.request('/api/auth/logout', { method: 'POST' });
    this.client.setAccessToken('');
  }
}

class UsersClient {
  constructor(private client: SaaSClient) {}

  async list(): Promise<User[]> {
    const result = await this.client.request<{ data: User[] }>('/api/users');
    return result.data;
  }

  async get(id: string): Promise<User> {
    const result = await this.client.request<{ data: User }>(`/api/users/${id}`);
    return result.data;
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const result = await this.client.request<{ data: User }>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return result.data;
  }

  async delete(id: string): Promise<void> {
    await this.client.request(`/api/users/${id}`, { method: 'DELETE' });
  }
}

class SubscriptionsClient {
  constructor(private client: SaaSClient) {}

  async get(): Promise<Subscription | null> {
    const result = await this.client.request<{ data: Subscription | null }>('/api/billing/subscriptions');
    return result.data;
  }

  async upgrade(planId: string): Promise<Subscription> {
    const result = await this.client.request<{ data: Subscription }>('/api/billing/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });
    return result.data;
  }

  async cancel(): Promise<void> {
    await this.client.request('/api/billing/subscriptions', { method: 'DELETE' });
  }

  async getPlans(): Promise<Plan[]> {
    const result = await this.client.request<{ data: Plan[] }>('/api/billing/plans');
    return result.data;
  }
}

export default SaaSClient;

