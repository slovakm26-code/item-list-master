/**
 * Storage Module - JSON Only
 * 
 * Centralizovaný vstupný bod pre JSON úložisko.
 * Web používa IndexedDB, Electron bude používať file system.
 */

import { StorageAdapter } from './StorageAdapter';
import { JSONStorageAdapter } from './JSONStorageAdapter';

export * from './StorageAdapter';
export { JSONStorageAdapter } from './JSONStorageAdapter';

/**
 * Create JSON storage adapter
 * - Web: IndexedDB backend
 * - Electron: File system backend (future)
 */
export const createStorageAdapter = (): StorageAdapter => {
  // V budúcnosti tu bude detekcia Electron prostredia
  // if (typeof window !== 'undefined' && (window as any).electronFS) {
  //   return new ElectronJSONAdapter();
  // }
  
  console.log('Using JSON adapter (IndexedDB)');
  return new JSONStorageAdapter();
};

// Singleton instance
let storageInstance: StorageAdapter | null = null;
let initPromise: Promise<StorageAdapter> | null = null;

/**
 * Get the global storage adapter instance (singleton)
 * Thread-safe initialization
 */
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

/**
 * Reset storage instance (for testing or migration)
 */
export const resetStorage = (): void => {
  storageInstance = null;
  initPromise = null;
};

/**
 * Check if storage is initialized
 */
export const isStorageReady = (): boolean => {
  return storageInstance?.isReady() ?? false;
};
