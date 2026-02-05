/**
 * Storage Module - JSON Only
 * @packageDocumentation
 * 
 * Centralizovaný vstupný bod pre JSON úložisko.
 * Web používa IndexedDB, Electron používa file system.
 */
/// <reference path="../../types/electron.d.ts" />

import { StorageAdapter } from './StorageAdapter';
import { JSONStorageAdapter } from './JSONStorageAdapter';
import { ElectronJSONAdapter } from './ElectronJSONAdapter';

export * from './StorageAdapter';
export { JSONStorageAdapter } from './JSONStorageAdapter';
export { ElectronJSONAdapter } from './ElectronJSONAdapter';

/**
 * Create JSON storage adapter
 * - Web: IndexedDB backend
 * - Electron: File system backend via IPC
 */
export const createStorageAdapter = (): StorageAdapter => {
  // Detect Electron environment
  if (typeof window !== 'undefined' && window.electronJSON) {
    console.log('Using Electron JSON adapter (file system)');
    return new ElectronJSONAdapter();
  }
  
  // Web fallback
  console.log('Using Web JSON adapter (IndexedDB)');
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
