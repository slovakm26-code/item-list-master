import { AppState, Item, Category } from '@/types';

/**
 * Storage Adapter Interface
 * Abstraction layer for different storage backends (localStorage, IndexedDB, SQLite)
 * This allows easy migration to Electron/SQLite in the future
 */
export interface StorageAdapter {
  // Initialization
  init(): Promise<void>;
  isReady(): boolean;
  
  // Full state operations
  loadState(): Promise<AppState | null>;
  saveState(state: AppState): Promise<void>;
  
  // Item operations (optimized for large datasets)
  getItems(options?: QueryOptions): Promise<Item[]>;
  getItemById(id: string): Promise<Item | null>;
  getItemCount(categoryId?: string): Promise<number>;
  addItem(item: Item): Promise<void>;
  updateItem(id: string, updates: Partial<Item>): Promise<void>;
  deleteItems(ids: string[]): Promise<void>;
  
  // Category operations
  getCategories(): Promise<Category[]>;
  addCategory(category: Category): Promise<void>;
  updateCategory(id: string, updates: Partial<Category>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  
  // Search (optimized for large datasets)
  searchItems(query: string, categoryId?: string): Promise<Item[]>;
  
  // Backup operations
  exportData(): Promise<ExportData>;
  importData(data: ExportData): Promise<void>;
  
  // Storage info
  getStorageInfo(): Promise<StorageInfo>;
}

export interface QueryOptions {
  categoryId?: string;
  offset?: number;
  limit?: number;
  sortColumn?: keyof Item;
  sortDirection?: 'asc' | 'desc';
  searchQuery?: string;
}

export interface ExportData {
  version: number;
  exportDate: string;
  categories: Category[];
  items: Item[];
  images?: Record<string, string>;
}

export interface StorageInfo {
  type: 'localStorage' | 'indexedDB' | 'sqlite';
  usedBytes: number;
  maxBytes: number;
  itemCount: number;
  supportsLargeDatasets: boolean;
}

// Storage type detection for future Electron
export const detectStorageType = (): 'localStorage' | 'indexedDB' | 'sqlite' => {
  // In Electron, we'll detect SQLite availability
  if (typeof window !== 'undefined' && (window as any).electronSQLite) {
    return 'sqlite';
  }
  
  // Check IndexedDB support
  if (typeof indexedDB !== 'undefined') {
    return 'indexedDB';
  }
  
  return 'localStorage';
};
