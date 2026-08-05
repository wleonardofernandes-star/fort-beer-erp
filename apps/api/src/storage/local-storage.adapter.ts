import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, promises as fs } from 'fs';
import { join } from 'path';
import type { Readable } from 'stream';

export interface StoragePort {
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

@Injectable()
export class LocalStorageAdapter implements StoragePort {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root =
      config.get<string>('STORAGE_LOCAL_ROOT') ||
      join(process.cwd(), 'uploads');
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<string> {
    const full = join(this.root, key);
    const dir = join(full, '..');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(full, body);
    return `local://${key}`;
  }

  async get(key: string): Promise<Readable> {
    return createReadStream(join(this.root, key));
  }

  async delete(key: string): Promise<void> {
    const full = join(this.root, key);
    if (existsSync(full)) await fs.unlink(full);
  }
}
