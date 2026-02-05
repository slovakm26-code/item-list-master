/**
 * Electron JSON Storage Adapter
 * 
 * Používa IPC bridge na komunikáciu s main procesom,
 * ktorý ukladá dáta ako JSON súbor na disk.
 */
/// <reference path="../../types/electron.d.ts" />

import { StorageAdapter, ExportData, StorageInfo, QueryOptions } from './StorageAdapter';
import { AppState, Item, Category } from '@/types';

export class ElectronJSONAdapter implements StorageAdapter {
  private ready = false;
  private cachedState: AppState | null = null;

  async init(): Promise<void> {
    if (!window.electronJSON) {
      throw new Error('ElectronJSON API not available');
    }
    
    // Load initial data
    const data = await window.electronJSON.load();
    this.cachedState = {
      categories: data.categories || [],
      items: data.items || [],
      selectedCategoryId: null,
      selectedItemIds: [],
      searchQuery: '',
      sortColumn: null,
      sortDirection: 'asc',
      useManualOrder: false,
      customFieldFilters: [],
    };
    
    this.ready = true;
    console.log(`ElectronJSONAdapter initialized: ${data.items?.length || 0} items`);
  }

  isReady(): boolean {
    return this.ready;
  }

  // === Full State Operations ===
  
  async loadState(): Promise<AppState | null> {
    if (this.cachedState) {
      return this.cachedState;
    }
    
    const data = await window.electronJSON!.load();
    this.cachedState = {
      categories: data.categories || [],
      items: data.items || [],
      selectedCategoryId: null,
      selectedItemIds: [],
      searchQuery: '',
      sortColumn: null,
      sortDirection: 'asc',
      useManualOrder: false,
      customFieldFilters: [],
    };
    
    return this.cachedState;
  }

  async saveState(state: AppState): Promise<void> {
    this.cachedState = state;
    await window.electronJSON!.save({
      categories: state.categories,
      items: state.items,
    });
  }

  // === Item Operations ===

  async getItems(options?: QueryOptions): Promise<Item[]> {
    const state = await this.loadState();
    if (!state) return [];

    let items = [...state.items];

    // Filter by category
    if (options?.categoryId) {
      items = items.filter(item => item.categoryId === options.categoryId);
    }

    // Search
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
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return aVal.localeCompare(bVal) * dir;
        }
        return ((aVal as number) - (bVal as number)) * dir;
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
    const state = await this.loadState();
    if (!state) return 0;
    
    if (categoryId) {
      return state.items.filter(item => item.categoryId === categoryId).length;
    }
    return state.items.length;
  }

  async addItem(item: Item): Promise<void> {
    const state = await this.loadState();
    if (!state) return;
    
    state.items.push(item);
    await this.saveState(state);
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const state = await this.loadState();
    if (!state) return;
    
    const index = state.items.findIndex(item => item.id === id);
    if (index !== -1) {
      state.items[index] = { ...state.items[index], ...updates };
      await this.saveState(state);
    }
  }

  async deleteItems(ids: string[]): Promise<void> {
    const state = await this.loadState();
    if (!state) return;
    
    const idsSet = new Set(ids);
    state.items = state.items.filter(item => !idsSet.has(item.id));
    await this.saveState(state);
    
    // Delete associated images
    if (window.electronImages) {
      for (const id of ids) {
        try {
          if (window.electronImages.delete) {
            await window.electronImages.delete(id);
          } else if (window.electronImages.deleteImage) {
            await window.electronImages.deleteImage(id);
          }
        } catch (e) {
          console.warn(`Failed to delete image for ${id}:`, e);
        }
      }
    }
  }

  async addItems(items: Item[], onProgress?: (count: number) => void): Promise<void> {
    const state = await this.loadState();
    if (!state) return;

    // Batch add with progress
    const batchSize = 1000;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      state.items.push(...batch);
      onProgress?.(Math.min(i + batchSize, items.length));
    }
    
    await this.saveState(state);
  }

  // === Category Operations ===

  async getCategories(): Promise<Category[]> {
    const state = await this.loadState();
    return state?.categories || [];
  }

  async addCategory(category: Category): Promise<void> {
    const state = await this.loadState();
    if (!state) return;
    
    state.categories.push(category);
    await this.saveState(state);
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    const state = await this.loadState();
    if (!state) return;
    
    const index = state.categories.findIndex(cat => cat.id === id);
    if (index !== -1) {
      state.categories[index] = { ...state.categories[index], ...updates };
      await this.saveState(state);
    }
  }

  async deleteCategory(id: string): Promise<void> {
    const state = await this.loadState();
    if (!state) return;
    
    state.categories = state.categories.filter(cat => cat.id !== id);
    // Also delete items in this category
    const itemsToDelete = state.items.filter(item => item.categoryId === id);
    state.items = state.items.filter(item => item.categoryId !== id);
    await this.saveState(state);
    
    // Delete associated images
    if (window.electronImages) {
      for (const item of itemsToDelete) {
        try {
          if (window.electronImages.delete) {
            await window.electronImages.delete(item.id);
          } else if (window.electronImages.deleteImage) {
            await window.electronImages.deleteImage(item.id);
          }
        } catch (e) {
          console.warn(`Failed to delete image for ${item.id}:`, e);
        }
      }
    }
  }

  // === Search ===

  async searchItems(query: string, categoryId?: string): Promise<Item[]> {
    return this.getItems({
      categoryId,
      searchQuery: query,
    });
  }

  // === Export/Import ===

  async exportData(): Promise<ExportData> {
    const state = await this.loadState();
    return {
      version: 3,
      exportDate: new Date().toISOString(),
      categories: state?.categories || [],
      items: state?.items || [],
    };
  }

  async importData(data: ExportData, onProgress?: (count: number) => void): Promise<void> {
    // Clear and replace
    this.cachedState = {
      categories: data.categories || [],
      items: [],
      selectedCategoryId: null,
      selectedItemIds: [],
      searchQuery: '',
      sortColumn: null,
      sortDirection: 'asc',
      useManualOrder: false,
      customFieldFilters: [],
    };

    // Add items with progress
    if (data.items) {
      await this.addItems(data.items, onProgress);
    } else {
      await this.saveState(this.cachedState);
    }
  }

  // === Database Export (not applicable for JSON) ===

  exportDatabase(): Uint8Array | null {
    // JSON doesn't have raw database export
    return null;
  }

  async importDatabase(data: Uint8Array): Promise<void> {
    // Try to parse as JSON
    const text = new TextDecoder().decode(data);
    const parsed = JSON.parse(text);
    await this.importData(parsed);
  }

  // === Storage Info ===

  async getStorageInfo(): Promise<StorageInfo> {
    const info = await window.electronJSON!.getInfo();
    return {
      type: 'indexedDB', // Report as indexedDB for compatibility
      usedBytes: info.size,
      maxBytes: Infinity, // File system has no practical limit
      itemCount: info.itemCount,
      supportsLargeDatasets: true,
    };
  }
}