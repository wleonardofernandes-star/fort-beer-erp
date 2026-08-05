import { Global, Module } from '@nestjs/common';
import { LocalStorageAdapter } from './local-storage.adapter';

export const STORAGE_PORT = Symbol('STORAGE_PORT');

@Global()
@Module({
  providers: [
    LocalStorageAdapter,
    { provide: STORAGE_PORT, useExisting: LocalStorageAdapter },
  ],
  exports: [STORAGE_PORT, LocalStorageAdapter],
})
export class StorageModule {}
