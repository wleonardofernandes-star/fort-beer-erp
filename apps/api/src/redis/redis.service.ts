import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    this.client = url ? new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true }) : null;
  }

  async connect() {
    if (this.client && this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  get enabled() {
    return !!this.client;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (this.client.status !== 'ready') await this.connect();
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (!this.client) return;
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }

  async get(key: string) {
    if (!this.client) return null;
    return this.client.get(key);
  }

  async del(key: string) {
    if (!this.client) return;
    await this.client.del(key);
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }
}
