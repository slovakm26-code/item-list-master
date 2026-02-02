import { StorageAdapter, detectStorageType } from './StorageAdapter';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { IndexedDBAdapter } from './IndexedDBAdapter';

export * from './StorageAdapter';
export { LocalStorageAdapter } from './LocalStorageAdapter';
export { IndexedDBAdapter } from './IndexedDBAdapter';

/**
 * Create the appropriate storage adapter based on environment
 * - Web: IndexedDB (with localStorage fallback)
 * - Electron (future): SQLite
 */
export const createStorageAdapter = (): StorageAdapter => {
  const type = detectStorageType();
  
  switch (type) {
    case 'sqlite':
      // Future: return new SQLiteAdapter();
      // For now, fall through to IndexedDB
      console.log('SQLite detected but not implemented yet, using IndexedDB');
      return new IndexedDBAdapter();
      
    case 'indexedDB':
      return new IndexedDBAdapter();
      
    case 'localStorage':
    default:
      return new LocalStorageAdapter();
  }
};

// Singleton instance
let storageInstance: StorageAdapter | null = null;

/**
 * Get the global storage adapter instance
 */
export const getStorage = async (): Promise<StorageAdapter> => {
  if (!storageInstance) {
    storageInstance = createStorageAdapter();
    await storageInstance.init();
  }
  return storageInstance;
};

/**
 * Reset storage instance (for testing or migration)
 */
export const resetStorage = (): void => {
  storageInstance = null;
};
