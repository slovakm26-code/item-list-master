import { AppState, Item, Category } from '@/types';

/**
 * Storage Adapter Interface
 * Abstraction layer for different storage backends (localStorage, IndexedDB, SQLite)
 * Optimized for handling millions of items with FTS5, batch operations, and pagination
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
  
  // Batch operations (critical for performance with large imports)
  addItems?(items: Item[], onProgress?: (count: number) => void): Promise<void>;
  
  // Category operations
  getCategories(): Promise<Category[]>;
  addCategory(category: Category): Promise<void>;
  updateCategory(id: string, updates: Partial<Category>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  
  // Search (FTS5 optimized for large datasets)
  searchItems(query: string, categoryId?: string): Promise<Item[]>;
  fullTextSearch?(query: string, options?: FTSOptions): Promise<Item[]>;
  
  // Backup operations
  exportData(): Promise<ExportData>;
  importData(data: ExportData, onProgress?: (count: number) => void): Promise<void>;
  
  // Database maintenance
  vacuum?(): Promise<void>;
  optimize?(): Promise<void>;
  
  // Statistics
  getStatistics?(): Promise<DatabaseStatistics>;
  
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
  // FTS5 full-text search
  useFTS?: boolean;
}

export interface FTSOptions {
  categoryId?: string;
  limit?: number;
  offset?: number;
  // FTS5 match mode: 'prefix' for autocomplete, 'phrase' for exact
  matchMode?: 'prefix' | 'phrase' | 'any';
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
  // SQLite specific info
  walMode?: boolean;
  ftsEnabled?: boolean;
}

export interface DatabaseStatistics {
  totalItems: number;
  totalCategories: number;
  databaseSizeBytes: number;
  itemsPerCategory: Record<string, number>;
  averageRating: number | null;
  itemsByYear: Record<number, number>;
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
