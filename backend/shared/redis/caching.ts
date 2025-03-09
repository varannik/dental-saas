import { RedisService } from './client';
   
export class RedisCacheService {
  private client = RedisService.getInstance().getClient();
  
  async cacheData(key: string, data: any, expirySeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(data), { EX: expirySeconds });
  }
  
  async getCachedData<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }
}