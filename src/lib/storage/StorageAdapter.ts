/// <reference path="../../types/electron.d.ts" />

import { AppState, Item, Category } from '@/types';

/**
 * Storage Adapter Interface
 * Abstraction layer for different storage backends
 */
export interface StorageAdapter {
  init(): Promise<void>;
  isReady(): boolean;
  
  // Full state operations
  loadState(): Promise<AppState | null>;
  saveState(state: AppState): Promise<void>;
  
  // Item operations
  getItems(options?: QueryOptions): Promise<Item[]>;
  getItemById(id: string): Promise<Item | null>;
  getItemCount(categoryId?: string): Promise<number>;
  addItem(item: Item): Promise<void>;
  updateItem(id: string, updates: Partial<Item>): Promise<void>;
  deleteItems(ids: string[]): Promise<void>;
  addItems?(items: Item[], onProgress?: (count: number) => void): Promise<void>;
  
  // Category operations
  getCategories(): Promise<Category[]>;
  addCategory(category: Category): Promise<void>;
  updateCategory(id: string, updates: Partial<Category>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  
  // Search
  searchItems(query: string, categoryId?: string): Promise<Item[]>;
  fullTextSearch?(query: string, options?: FTSOptions): Promise<Item[]>;
  
  // Export/Import
  exportData(): Promise<ExportData>;
  importData(data: ExportData, onProgress?: (count: number) => void): Promise<void>;
  
  // Raw database export/import
  exportDatabase(): Uint8Array | null;
  importDatabase(data: Uint8Array): Promise<void>;
  
  // Maintenance
  vacuum?(): Promise<void>;
  optimize?(): Promise<void>;
  getStatistics?(): Promise<DatabaseStatistics>;
  getStorageInfo(): Promise<StorageInfo>;
}

export interface QueryOptions {
  categoryId?: string;
  offset?: number;
  limit?: number;
  sortColumn?: keyof Item;
  sortDirection?: 'asc' | 'desc';
  searchQuery?: string;
  useFTS?: boolean;
}

export interface FTSOptions {
  categoryId?: string;
  limit?: number;
  offset?: number;
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

export const detectStorageType = (): 'indexedDB' | 'sqlite' => {
  if (typeof window !== 'undefined' && window.electronDB) {
    return 'sqlite';
  }
  return 'indexedDB';
};
