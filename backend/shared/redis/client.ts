   // shared/redis/client.ts
   import { createClient, RedisClientType } from 'redis';
   
   export class RedisService {
     private static instance: RedisService;
     private client: RedisClientType;
     
     private constructor() {
       this.client = createClient({
         url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
         password: process.env.REDIS_PASSWORD
       });
       
       this.client.on('error', err => console.error('Redis error:', err));
     }
     
     public static getInstance(): RedisService {
       if (!RedisService.instance) {
         RedisService.instance = new RedisService();
       }
       return RedisService.instance;
     }
     
     async connect(): Promise<void> {
       await this.client.connect();
     }
     
     getClient(): RedisClientType {
       return this.client;
     }
   }