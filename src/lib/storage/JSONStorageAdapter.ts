/**
 * JSON Storage Adapter
 * 
 * Jednoduchý adapter pre JSON úložisko s IndexedDB backendom.
 * Spoľahlivejšia alternatíva k SQLite (sql.js).
 */

import { AppState, Item, Category } from '@/types';
import { StorageAdapter, QueryOptions, ExportData, StorageInfo, DatabaseStatistics } from './StorageAdapter';

const DB_NAME = 'stuff-organizer-json';
const DB_VERSION = 1;
const STORE_NAME = 'data';
const DATA_KEY = 'main';

interface StoredData {
  categories: Category[];
  items: Item[];
  version: number;
}

export class JSONStorageAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private ready = false;
  private cachedState: AppState | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB: ' + request.error?.message));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.ready = true;
        console.log('JSONStorageAdapter initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  isReady(): boolean {
    return this.ready && this.db !== null;
  }

  // ============================================
  // FULL STATE OPERATIONS
  // ============================================

  async loadState(): Promise<AppState | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(DATA_KEY);

      request.onerror = () => reject(new Error('Failed to load state'));
      
      request.onsuccess = () => {
        const data = request.result as StoredData | undefined;
        
        if (!data) {
          resolve(null);
          return;
        }

        // Reconstruct AppState from stored data
        const state: AppState = {
          categories: data.categories || [],
          items: data.items || [],
          selectedCategoryId: 'all',
          selectedItemIds: [],
          searchQuery: '',
          sortColumn: 'name',
          sortDirection: 'asc',
          useManualOrder: false,
          customFieldFilters: [],
        };

        this.cachedState = state;
        resolve(state);
      };
    });
  }

  async saveState(state: AppState): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const data: StoredData = {
      categories: state.categories,
      items: state.items,
      version: 3,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data, DATA_KEY);

      request.onerror = () => reject(new Error('Failed to save state'));
      request.onsuccess = () => {
        this.cachedState = state;
        resolve();
      };
    });
  }

  // ============================================
  // ITEM OPERATIONS
  // ============================================

  async getItems(options?: QueryOptions): Promise<Item[]> {
    const state = this.cachedState || await this.loadState();
    if (!state) return [];

    let items = [...state.items];

    // Filter by category
    if (options?.categoryId && options.categoryId !== 'all') {
      items = items.filter(i => i.categoryId === options.categoryId);
    }

    // Search
    if (options?.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(query) ||
        i.description.toLowerCase().includes(query) ||
        i.genres.some(g => g.toLowerCase().includes(query))
      );
    }

    // Sort
    if (options?.sortColumn) {
      const dir = options.sortDirection === 'desc' ? -1 : 1;
      items.sort((a, b) => {
        const aVal = a[options.sortColumn!];
        const bVal = b[options.sortColumn!];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        if (aVal < bVal) return -dir;
        if (aVal > bVal) return dir;
        return 0;
      });
    }

    // Pagination
    if (options?.offset !== undefined || options?.limit !== undefined) {
      const start = options.offset || 0;
      const end = options.limit ? start + options.limit : undefined;
      items = items.slice(start, end);
    }

    return items;
  }

  async getItemById(id: string): Promise<Item | null> {
    const state = this.cachedState || await this.loadState();
    return state?.items.find(i => i.id === id) || null;
  }

  async getItemCount(categoryId?: string): Promise<number> {
    const state = this.cachedState || await this.loadState();
    if (!state) return 0;
    
    if (!categoryId || categoryId === 'all') {
      return state.items.length;
    }
    return state.items.filter(i => i.categoryId === categoryId).length;
  }

  async addItem(item: Item): Promise<void> {
    const state = this.cachedState || await this.loadState();
    if (!state) throw new Error('No state loaded');
    
    state.items.push(item);
    await this.saveState(state);
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const state = this.cachedState || await this.loadState();
    if (!state) throw new Error('No state loaded');
    
    const index = state.items.findIndex(i => i.id === id);
    if (index >= 0) {
      state.items[index] = { ...state.items[index], ...updates };
      await this.saveState(state);
    }
  }

  async deleteItems(ids: string[]): Promise<void> {
    const state = this.cachedState || await this.loadState();
    if (!state) throw new Error('No state loaded');
    
    state.items = state.items.filter(i => !ids.includes(i.id));
    await this.saveState(state);
  }

  async addItems(items: Item[], onProgress?: (count: number) => void): Promise<void> {
    const state = this.cachedState || await this.loadState();
    if (!state) throw new Error('No state loaded');
    
    for (let i = 0; i < items.length; i++) {
      state.items.push(items[i]);
      if (onProgress && i % 100 === 0) {
        onProgress(i);
      }
    }
    
    await this.saveState(state);
    onProgress?.(items.length);
  }

  // ============================================
  // CATEGORY OPERATIONS
  // ============================================

  async getCategories(): Promise<Category[]> {
    const state = this.cachedState || await this.loadState();
    return state?.categories || [];
  }

  async addCategory(category: Category): Promise<void> {
    const state = this.cachedState || await this.loadState();
    if (!state) throw new Error('No state loaded');
    
    state.categories.push(category);
    await this.saveState(state);
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    const state = this.cachedState || await this.loadState();
    if (!state) throw new Error('No state loaded');
    
    const index = state.categories.findIndex(c => c.id === id);
    if (index >= 0) {
      state.categories[index] = { ...state.categories[index], ...updates };
      await this.saveState(state);
    }
  }

  async deleteCategory(id: string): Promise<void> {
    const state = this.cachedState || await this.loadState();
    if (!state) throw new Error('No state loaded');
    
    state.categories = state.categories.filter(c => c.id !== id);
    // Also delete items in this category
    state.items = state.items.filter(i => i.categoryId !== id);
    await this.saveState(state);
  }

  // ============================================
  // SEARCH
  // ============================================

  async searchItems(query: string, categoryId?: string): Promise<Item[]> {
    return this.getItems({ searchQuery: query, categoryId });
  }

  // ============================================
  // EXPORT/IMPORT
  // ============================================

  async exportData(): Promise<ExportData> {
    const state = this.cachedState || await this.loadState();
    
    return {
      version: 3,
      exportDate: new Date().toISOString(),
      categories: state?.categories || [],
      items: state?.items || [],
    };
  }

  async importData(data: ExportData, onProgress?: (count: number) => void): Promise<void> {
    // Validate basic structure
    if (!data.categories || !data.items) {
      throw new Error('Invalid import data: missing categories or items');
    }

    const state: AppState = {
      categories: data.categories,
      items: data.items,
      selectedCategoryId: 'all',
      selectedItemIds: [],
      searchQuery: '',
      sortColumn: 'name',
      sortDirection: 'asc',
      useManualOrder: false,
      customFieldFilters: [],
    };

    await this.saveState(state);
    onProgress?.(data.items.length);
  }

  // ============================================
  // RAW DATABASE (not applicable for JSON)
  // ============================================

  exportDatabase(): Uint8Array | null {
    // JSON adapter doesn't support binary export
    // Use exportData() for JSON export
    return null;
  }

  async importDatabase(data: Uint8Array): Promise<void> {
    // Try to parse as JSON (for backwards compatibility)
    try {
      const text = new TextDecoder().decode(data);
      const parsed = JSON.parse(text);
      await this.importData(parsed);
    } catch {
      throw new Error('JSON adapter only supports JSON import. Use importData() instead.');
    }
  }

  // ============================================
  // STORAGE INFO
  // ============================================

  async getStorageInfo(): Promise<StorageInfo> {
    const state = this.cachedState || await this.loadState();
    
    // Estimate size
    const jsonStr = JSON.stringify({
      categories: state?.categories || [],
      items: state?.items || [],
    });
    const sizeBytes = new Blob([jsonStr]).size;

    return {
      type: 'indexedDB',
      usedBytes: sizeBytes,
      maxBytes: 100 * 1024 * 1024, // ~100MB practical limit
      itemCount: state?.items.length || 0,
      supportsLargeDatasets: true,
    };
  }

  async getStatistics(): Promise<DatabaseStatistics> {
    const state = this.cachedState || await this.loadState();
    
    const items = state?.items || [];
    const categories = state?.categories || [];

    // Items per category
    const itemsPerCategory: Record<string, number> = {};
    for (const cat of categories) {
      itemsPerCategory[cat.id] = items.filter(i => i.categoryId === cat.id).length;
    }

    // Average rating
    const ratings = items.filter(i => i.rating !== null).map(i => i.rating!);
    const averageRating = ratings.length > 0 
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
      : null;

    // Items by year
    const itemsByYear: Record<number, number> = {};
    for (const item of items) {
      if (item.year) {
        itemsByYear[item.year] = (itemsByYear[item.year] || 0) + 1;
      }
    }

    const jsonStr = JSON.stringify({ categories, items });

    return {
      totalItems: items.length,
      totalCategories: categories.length,
      databaseSizeBytes: new Blob([jsonStr]).size,
      itemsPerCategory,
      averageRating,
      itemsByYear,
    };
  }

  async vacuum(): Promise<void> {
    // No-op for JSON storage
  }

  async optimize(): Promise<void> {
    // No-op for JSON storage
  }
}
