import { AppState, Item, Category } from '@/types';
import { StorageAdapter, QueryOptions, ExportData, StorageInfo } from './StorageAdapter';
import { initDatabase, saveDatabase } from '@/lib/database';

const DB_KEY = 'stuff_organizer_db';

/**
 * LocalStorage Adapter
 * Simple adapter wrapping existing localStorage implementation
 * Limited to ~5-10MB, good for <1000 items
 */
export class LocalStorageAdapter implements StorageAdapter {
  private ready = false;

  async init(): Promise<void> {
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async loadState(): Promise<AppState | null> {
    try {
      return initDatabase();
    } catch {
      return null;
    }
  }

  async saveState(state: AppState): Promise<void> {
    saveDatabase(state);
  }

  async getItems(options?: QueryOptions): Promise<Item[]> {
    const state = await this.loadState();
    if (!state) return [];

    let items = [...state.items];

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
    const state = await this.loadState();
    return state?.items.find(item => item.id === id) || null;
  }

  async getItemCount(categoryId?: string): Promise<number> {
    const items = await this.getItems({ categoryId });
    return items.length;
  }

  async addItem(item: Item): Promise<void> {
    const state = await this.loadState();
    if (state) {
      state.items.push(item);
      await this.saveState(state);
    }
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const state = await this.loadState();
    if (state) {
      const index = state.items.findIndex(item => item.id === id);
      if (index !== -1) {
        state.items[index] = { ...state.items[index], ...updates };
        await this.saveState(state);
      }
    }
  }

  async deleteItems(ids: string[]): Promise<void> {
    const state = await this.loadState();
    if (state) {
      state.items = state.items.filter(item => !ids.includes(item.id));
      await this.saveState(state);
    }
  }

  async getCategories(): Promise<Category[]> {
    const state = await this.loadState();
    return state?.categories || [];
  }

  async addCategory(category: Category): Promise<void> {
    const state = await this.loadState();
    if (state) {
      state.categories.push(category);
      await this.saveState(state);
    }
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    const state = await this.loadState();
    if (state) {
      const index = state.categories.findIndex(cat => cat.id === id);
      if (index !== -1) {
        state.categories[index] = { ...state.categories[index], ...updates };
        await this.saveState(state);
      }
    }
  }

  async deleteCategory(id: string): Promise<void> {
    const state = await this.loadState();
    if (state) {
      state.categories = state.categories.filter(cat => cat.id !== id);
      await this.saveState(state);
    }
  }

  async searchItems(query: string, categoryId?: string): Promise<Item[]> {
    return this.getItems({ searchQuery: query, categoryId });
  }

  async exportData(): Promise<ExportData> {
    const state = await this.loadState();
    return {
      version: 2,
      exportDate: new Date().toISOString(),
      categories: state?.categories || [],
      items: state?.items || [],
    };
  }

  async importData(data: ExportData): Promise<void> {
    const state = await this.loadState();
    if (state) {
      state.categories = data.categories;
      state.items = data.items;
      await this.saveState(state);
    }
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const state = await this.loadState();
    const data = localStorage.getItem(DB_KEY) || '';
    const usedBytes = new Blob([data]).size;

    return {
      type: 'localStorage',
      usedBytes,
      maxBytes: 5 * 1024 * 1024, // ~5MB typical limit
      itemCount: state?.items.length || 0,
      supportsLargeDatasets: false,
    };
  }
}
