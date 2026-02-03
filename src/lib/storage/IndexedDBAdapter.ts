import { AppState, Item, Category } from '@/types';
import { StorageAdapter, QueryOptions, ExportData, StorageInfo } from './StorageAdapter';
import { generateId } from '@/lib/database';

const DB_NAME = 'stuff_organizer_db';
const DB_VERSION = 1;

/**
 * IndexedDB Storage Adapter
 * Supports ~500MB+ storage, good for 10,000-100,000+ items
 * Uses indexes for fast searching
 */
export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private ready = false;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        this.ready = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Items store with indexes
        if (!db.objectStoreNames.contains('items')) {
          const itemsStore = db.createObjectStore('items', { keyPath: 'id' });
          itemsStore.createIndex('categoryId', 'categoryId', { unique: false });
          itemsStore.createIndex('name', 'name', { unique: false });
          itemsStore.createIndex('year', 'year', { unique: false });
          itemsStore.createIndex('rating', 'rating', { unique: false });
          itemsStore.createIndex('addedDate', 'addedDate', { unique: false });
          itemsStore.createIndex('orderIndex', 'orderIndex', { unique: false });
        }

        // Categories store
        if (!db.objectStoreNames.contains('categories')) {
          const categoriesStore = db.createObjectStore('categories', { keyPath: 'id' });
          categoriesStore.createIndex('orderIndex', 'orderIndex', { unique: false });
        }

        // App state store (for UI state)
        if (!db.objectStoreNames.contains('appState')) {
          db.createObjectStore('appState', { keyPath: 'key' });
        }

        // Images store (separate for performance)
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'itemId' });
        }
      };
    });
  }

  isReady(): boolean {
    return this.ready && this.db !== null;
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async loadState(): Promise<AppState | null> {
    const categories = await this.getCategories();
    const items = await this.getItems();
    
    const stateStore = this.getStore('appState');
    const uiState = await this.promisifyRequest(stateStore.get('uiState'));

    if (categories.length === 0 && items.length === 0) {
      return null;
    }

    return {
      categories,
      items,
      selectedCategoryId: uiState?.selectedCategoryId || 'all',
      selectedItemIds: uiState?.selectedItemIds || [],
      searchQuery: uiState?.searchQuery || '',
      sortColumn: uiState?.sortColumn || 'name',
      sortDirection: uiState?.sortDirection || 'asc',
      useManualOrder: uiState?.useManualOrder || false,
      customFieldFilters: uiState?.customFieldFilters || [],
    };
  }

  async saveState(state: AppState): Promise<void> {
    // Save categories
    const categoriesStore = this.getStore('categories', 'readwrite');
    await this.promisifyRequest(categoriesStore.clear());
    for (const category of state.categories) {
      await this.promisifyRequest(categoriesStore.put(category));
    }

    // Save items
    const itemsStore = this.getStore('items', 'readwrite');
    await this.promisifyRequest(itemsStore.clear());
    for (const item of state.items) {
      await this.promisifyRequest(itemsStore.put(item));
    }

    // Save UI state
    const stateStore = this.getStore('appState', 'readwrite');
    await this.promisifyRequest(stateStore.put({
      key: 'uiState',
      selectedCategoryId: state.selectedCategoryId,
      selectedItemIds: state.selectedItemIds,
      searchQuery: state.searchQuery,
      sortColumn: state.sortColumn,
      sortDirection: state.sortDirection,
      useManualOrder: state.useManualOrder,
    }));
  }

  async getItems(options?: QueryOptions): Promise<Item[]> {
    const store = this.getStore('items');
    let items: Item[] = await this.promisifyRequest(store.getAll());

    // Filter by category
    if (options?.categoryId && options.categoryId !== 'all') {
      items = items.filter(item => item.categoryId === options.categoryId);
    }

    // Search filter
    if (options?.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      items = items.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.genres?.some(g => g.toLowerCase().includes(query))
      );
    }

    // Sort
    if (options?.sortColumn) {
      const col = options.sortColumn;
      const dir = options.sortDirection === 'desc' ? -1 : 1;
      items.sort((a, b) => {
        const aVal = a[col];
        const bVal = b[col];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
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
    const store = this.getStore('items');
    return this.promisifyRequest(store.get(id));
  }

  async getItemCount(categoryId?: string): Promise<number> {
    const items = await this.getItems({ categoryId });
    return items.length;
  }

  async addItem(item: Item): Promise<void> {
    const store = this.getStore('items', 'readwrite');
    await this.promisifyRequest(store.add(item));
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const store = this.getStore('items', 'readwrite');
    const existing = await this.promisifyRequest(store.get(id));
    if (existing) {
      await this.promisifyRequest(store.put({ ...existing, ...updates }));
    }
  }

  async deleteItems(ids: string[]): Promise<void> {
    const store = this.getStore('items', 'readwrite');
    for (const id of ids) {
      await this.promisifyRequest(store.delete(id));
    }
  }

  async getCategories(): Promise<Category[]> {
    const store = this.getStore('categories');
    const categories = await this.promisifyRequest(store.getAll());
    return categories.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async addCategory(category: Category): Promise<void> {
    const store = this.getStore('categories', 'readwrite');
    await this.promisifyRequest(store.add(category));
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    const store = this.getStore('categories', 'readwrite');
    const existing = await this.promisifyRequest(store.get(id));
    if (existing) {
      await this.promisifyRequest(store.put({ ...existing, ...updates }));
    }
  }

  async deleteCategory(id: string): Promise<void> {
    const store = this.getStore('categories', 'readwrite');
    await this.promisifyRequest(store.delete(id));
  }

  async searchItems(query: string, categoryId?: string): Promise<Item[]> {
    return this.getItems({ searchQuery: query, categoryId });
  }

  async exportData(): Promise<ExportData> {
    const categories = await this.getCategories();
    const items = await this.getItems();

    return {
      version: 2,
      exportDate: new Date().toISOString(),
      categories,
      items,
    };
  }

  async importData(data: ExportData): Promise<void> {
    // Clear existing data
    const categoriesStore = this.getStore('categories', 'readwrite');
    await this.promisifyRequest(categoriesStore.clear());
    
    const itemsStore = this.getStore('items', 'readwrite');
    await this.promisifyRequest(itemsStore.clear());

    // Import categories
    for (const category of data.categories) {
      await this.addCategory(category);
    }

    // Import items
    for (const item of data.items) {
      await this.addItem(item);
    }
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const items = await this.getItems();
    
    // Estimate storage usage
    const estimate = await navigator.storage?.estimate?.();
    const usedBytes = estimate?.usage || 0;
    const maxBytes = estimate?.quota || 500 * 1024 * 1024; // 500MB default

    return {
      type: 'indexedDB',
      usedBytes,
      maxBytes,
      itemCount: items.length,
      supportsLargeDatasets: true,
    };
  }
}
