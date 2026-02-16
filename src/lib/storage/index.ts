/**
 * Storage Module
 * @packageDocumentation
 * 
 * - Web: JSONStorageAdapter (IndexedDB)
 * - Electron: ElectronSQLiteAdapter (sql.js via IPC)
 */
/// <reference path="../../types/electron.d.ts" />

import { StorageAdapter } from './StorageAdapter';
import { JSONStorageAdapter } from './JSONStorageAdapter';
import { ElectronSQLiteAdapter } from './ElectronSQLiteAdapter';

export * from './StorageAdapter';
export { JSONStorageAdapter } from './JSONStorageAdapter';
export { ElectronSQLiteAdapter } from './ElectronSQLiteAdapter';

/**
 * Create storage adapter
 * - Electron: SQLite via sql.js (IPC)
 * - Web: IndexedDB (JSON)
 */
export const createStorageAdapter = (): StorageAdapter => {
  if (typeof window !== 'undefined' && window.electronDB) {
    console.log('Using Electron SQLite adapter (sql.js)');
    return new ElectronSQLiteAdapter();
  }
  
  console.log('Using Web JSON adapter (IndexedDB)');
  return new JSONStorageAdapter();
};

// Singleton instance
let storageInstance: StorageAdapter | null = null;
let initPromise: Promise<StorageAdapter> | null = null;

export const getStorage = async (): Promise<StorageAdapter> => {
  if (storageInstance?.isReady()) {
    return storageInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      storageInstance = createStorageAdapter();
      await storageInstance.init();
      return storageInstance;
    })();
  }

  return initPromise;
};

export const resetStorage = (): void => {
  storageInstance = null;
  initPromise = null;
};

export const isStorageReady = (): boolean => {
  return storageInstance?.isReady() ?? false;
};
