/**
 * Electron JSON Storage Adapter - Chunked Version for 10M+ Items
 * 
 * Features:
 * - Lazy loading: first 2 chunks loaded immediately, rest in background
 * - Smart partial updates: only rewrite changed chunks
 * - Memory-first architecture: all items kept in RAM after load
 * - Web Worker integration ready
 */
/// <reference path="../../types/electron.d.ts" />

import { StorageAdapter, ExportData, StorageInfo, QueryOptions } from './StorageAdapter';
import { AppState, Item, Category } from '@/types';

const CHUNK_SIZE = 100_000; // Must match main.ts

export class ElectronJSONAdapter implements StorageAdapter {
  private ready = false;
  private cachedState: AppState | null = null;
  private totalItems = 0;
  private chunkCount = 0;
  private loadedChunks = 0;
  private isLoadingBackground = false;
  private onBackgroundLoadComplete?: () => void;

  async init(): Promise<void> {
    if (!window.electronJSON) {
      throw new Error('ElectronJSON API not available');
    }
    
    // Check if loadInitial is available (chunked version)
    if (window.electronJSON.loadInitial) {
      await this.initChunked();
    } else {
      // Fallback to legacy full load
      await this.initLegacy();
    }
    
    this.ready = true;
  }

  /**
   * Chunked initialization - load first 2 chunks for instant UI
   */
  private async initChunked(): Promise<void> {
    const data = await window.electronJSON!.loadInitial();
    
    this.totalItems = data.totalItems;
    this.chunkCount = data.chunkCount;
    this.loadedChunks = data.loadedChunks;
    
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
    
    console.log(`ElectronJSONAdapter: Initial load ${data.items.length}/${this.totalItems} items (${this.loadedChunks}/${this.chunkCount} chunks)`);
    
    // Load remaining chunks in background if there are more
    if (this.loadedChunks < this.chunkCount) {
      this.loadRemainingChunksInBackground();
    }
  }

  /**
   * Load remaining chunks in background (non-blocking)
   */
  private async loadRemainingChunksInBackground(): Promise<void> {
    if (this.isLoadingBackground || !window.electronJSON?.loadRemainingChunks) return;
    
    this.isLoadingBackground = true;
    
    try {
      const remainingItems = await window.electronJSON.loadRemainingChunks(this.loadedChunks);
      
      if (this.cachedState) {
        this.cachedState.items = [...this.cachedState.items, ...remainingItems];
      }
      
      this.loadedChunks = this.chunkCount;
      console.log(`ElectronJSONAdapter: Background load complete, total ${this.cachedState?.items.length} items`);
      
      this.onBackgroundLoadComplete?.();
    } catch (error) {
      console.error('Failed to load remaining chunks:', error);
    } finally {
      this.isLoadingBackground = false;
    }
  }

  /**
   * Legacy initialization - load all at once
   */
  private async initLegacy(): Promise<void> {
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
    
    this.totalItems = this.cachedState.items.length;
    console.log(`ElectronJSONAdapter: Legacy load ${this.totalItems} items`);
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Check if all chunks are loaded
   */
  isFullyLoaded(): boolean {
    return this.loadedChunks >= this.chunkCount;
  }

  /**
   * Get loading progress (0-1)
   */
  getLoadingProgress(): number {
    if (this.chunkCount === 0) return 1;
    return this.loadedChunks / this.chunkCount;
  }

  /**
   * Wait for background load to complete
   */
  async waitForFullLoad(): Promise<void> {
    if (this.isFullyLoaded()) return;
    
    return new Promise(resolve => {
      this.onBackgroundLoadComplete = resolve;
    });
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

  /**
   * Save only categories (fast, no item chunks touched)
   */
  async saveCategories(categories: Category[]): Promise<void> {
    if (this.cachedState) {
      this.cachedState.categories = categories;
    }
    
    if (window.electronJSON?.updateCategories) {
      await window.electronJSON.updateCategories(categories);
    } else {
      await this.saveState(this.cachedState!);
    }
  }

  /**
   * Smart partial save - only update affected chunk
   */
  async saveItemToChunk(item: Item): Promise<void> {
    if (!this.cachedState || !window.electronJSON?.updateChunk) {
      // Fallback to full save
      await this.saveState(this.cachedState!);
      return;
    }
    
    // Find which chunk this item belongs to
    const itemIndex = this.cachedState.items.findIndex(i => i.id === item.id);
    if (itemIndex === -1) {
      // New item, add to end
      this.cachedState.items.push(item);
      const chunkIndex = Math.floor(this.cachedState.items.length / CHUNK_SIZE);
      const chunkStart = chunkIndex * CHUNK_SIZE;
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, this.cachedState.items.length);
      const chunkItems = this.cachedState.items.slice(chunkStart, chunkEnd);
      await window.electronJSON.updateChunk(chunkIndex, chunkItems);
    } else {
      // Update existing item
      this.cachedState.items[itemIndex] = item;
      const chunkIndex = Math.floor(itemIndex / CHUNK_SIZE);
      const chunkStart = chunkIndex * CHUNK_SIZE;
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, this.cachedState.items.length);
      const chunkItems = this.cachedState.items.slice(chunkStart, chunkEnd);
      await window.electronJSON.updateChunk(chunkIndex, chunkItems);
    }
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
    
    // Use smart partial save if available
    if (window.electronJSON?.updateChunk) {
      await this.saveItemToChunk(item);
    } else {
      await this.saveState(state);
    }
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const state = await this.loadState();
    if (!state) return;
    
    const index = state.items.findIndex(item => item.id === id);
    if (index !== -1) {
      const updatedItem = { ...state.items[index], ...updates };
      state.items[index] = updatedItem;
      
      // Use smart partial save if available
      if (window.electronJSON?.updateChunk) {
        await this.saveItemToChunk(updatedItem);
      } else {
        await this.saveState(state);
      }
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
    const batchSize = 10000;
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
    await this.saveCategories(state.categories);
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    const state = await this.loadState();
    if (!state) return;
    
    const index = state.categories.findIndex(cat => cat.id === id);
    if (index !== -1) {
      state.categories[index] = { ...state.categories[index], ...updates };
      await this.saveCategories(state.categories);
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
      version: 4,
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
    return null;
  }

  async importDatabase(data: Uint8Array): Promise<void> {
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
      maxBytes: Infinity,
      itemCount: info.itemCount,
      supportsLargeDatasets: true,
    };
  }

  /**
   * Get extended info with chunking details
   */
  async getExtendedInfo(): Promise<{
    path: string;
    size: number;
    itemCount: number;
    categoryCount: number;
    chunkCount: number;
    chunkSize: number;
    lastModified: string;
  }> {
    return window.electronJSON!.getInfo();
  }

  /**
   * Open data folder in file explorer
   */
  async openDataFolder(): Promise<void> {
    if (window.electronApp?.openDataFolder) {
      await window.electronApp.openDataFolder();
    }
  }

  /**
   * Get user data path
   */
  async getUserDataPath(): Promise<string> {
    if (window.electronApp?.getUserDataPath) {
      return window.electronApp.getUserDataPath();
    }
    return '';
  }
}
