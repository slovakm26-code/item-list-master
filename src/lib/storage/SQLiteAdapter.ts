/**
 * SQLite Storage Adapter for Electron
 * 
 * SETUP INSTRUCTIONS:
 * 1. Install in Electron project: npm install better-sqlite3
 * 2. Copy this file to your Electron project
 * 3. Create the IPC bridge in main.ts (see below)
 * 4. Update createStorageAdapter() in index.ts to use this adapter
 * 
 * This adapter uses IPC to communicate with the main process where
 * better-sqlite3 runs (it cannot run in renderer due to native modules)
 */

import { AppState, Item, Category } from '@/types';
import { StorageAdapter, QueryOptions, ExportData, StorageInfo } from './StorageAdapter';

// Type for Electron IPC (will be injected via preload script)
declare global {
  interface Window {
    electronSQLite?: {
      query: (sql: string, params?: any[]) => Promise<any[]>;
      run: (sql: string, params?: any[]) => Promise<{ changes: number; lastInsertRowid: number }>;
      exec: (sql: string) => Promise<void>;
      getInfo: () => Promise<{ size: number; itemCount: number }>;
    };
  }
}

/**
 * SQLite Adapter - handles millions of items efficiently
 * Uses indexes for fast search and sorting
 */
export class SQLiteAdapter implements StorageAdapter {
  private ready = false;
  private sqlite = window.electronSQLite;

  async init(): Promise<void> {
    if (!this.sqlite) {
      throw new Error('SQLite not available. Are you running in Electron?');
    }

    // Create tables with indexes
    await this.sqlite.exec(`
      -- Categories table
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parentId TEXT,
        orderIndex INTEGER DEFAULT 0,
        icon TEXT,
        emoji TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(orderIndex);

      -- Items table with full-text search support
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        year INTEGER,
        rating REAL,
        genres TEXT,
        description TEXT,
        categoryId TEXT NOT NULL,
        path TEXT,
        addedDate TEXT,
        coverPath TEXT,
        orderIndex INTEGER DEFAULT 0,
        FOREIGN KEY (categoryId) REFERENCES categories(id)
      );
      
      -- Indexes for fast querying
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(categoryId);
      CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
      CREATE INDEX IF NOT EXISTS idx_items_year ON items(year);
      CREATE INDEX IF NOT EXISTS idx_items_rating ON items(rating);
      CREATE INDEX IF NOT EXISTS idx_items_added ON items(addedDate);
      CREATE INDEX IF NOT EXISTS idx_items_order ON items(orderIndex);

      -- App state table
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- Images stored separately for performance (optional - can use coverPath in items)
      CREATE TABLE IF NOT EXISTS images (
        itemId TEXT PRIMARY KEY,
        thumbnail TEXT,
        FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE CASCADE
      );
    `);

    this.ready = true;
  }

  isReady(): boolean {
    return this.ready && !!this.sqlite;
  }

  async loadState(): Promise<AppState | null> {
    const categories = await this.getCategories();
    const items = await this.getItems();
    
    const stateRows = await this.sqlite!.query(
      'SELECT value FROM app_state WHERE key = ?',
      ['uiState']
    );
    
    const uiState = stateRows[0] ? JSON.parse(stateRows[0].value) : {};

    if (categories.length === 0 && items.length === 0) {
      return null;
    }

    return {
      categories,
      items,
      selectedCategoryId: uiState.selectedCategoryId || 'all',
      selectedItemIds: uiState.selectedItemIds || [],
      searchQuery: uiState.searchQuery || '',
      sortColumn: uiState.sortColumn || 'name',
      sortDirection: uiState.sortDirection || 'asc',
      useManualOrder: uiState.useManualOrder || false,
    };
  }

  async saveState(state: AppState): Promise<void> {
    // Save categories
    await this.sqlite!.exec('DELETE FROM categories');
    for (const cat of state.categories) {
      await this.sqlite!.run(
        `INSERT INTO categories (id, name, parentId, orderIndex, icon, emoji) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cat.id, cat.name, cat.parentId, cat.orderIndex, cat.icon, cat.emoji]
      );
    }

    // Save items
    await this.sqlite!.exec('DELETE FROM items');
    for (const item of state.items) {
      await this.sqlite!.run(
        `INSERT INTO items (id, name, year, rating, genres, description, categoryId, path, addedDate, coverPath, orderIndex)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.name, item.year, item.rating,
          JSON.stringify(item.genres), item.description,
          item.categoryId, item.path, item.addedDate,
          item.coverPath, item.orderIndex
        ]
      );
    }

    // Save UI state
    await this.sqlite!.run(
      `INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)`,
      ['uiState', JSON.stringify({
        selectedCategoryId: state.selectedCategoryId,
        selectedItemIds: state.selectedItemIds,
        searchQuery: state.searchQuery,
        sortColumn: state.sortColumn,
        sortDirection: state.sortDirection,
        useManualOrder: state.useManualOrder,
      })]
    );
  }

  async getItems(options?: QueryOptions): Promise<Item[]> {
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params: any[] = [];

    // Category filter
    if (options?.categoryId && options.categoryId !== 'all') {
      sql += ' AND categoryId = ?';
      params.push(options.categoryId);
    }

    // Search filter (uses LIKE - for better performance consider FTS5)
    if (options?.searchQuery) {
      sql += ' AND (name LIKE ? OR description LIKE ? OR genres LIKE ?)';
      const searchPattern = `%${options.searchQuery}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Sorting
    if (options?.sortColumn) {
      const direction = options.sortDirection === 'desc' ? 'DESC' : 'ASC';
      sql += ` ORDER BY ${options.sortColumn} ${direction} NULLS LAST`;
    }

    // Pagination
    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = await this.sqlite!.query(sql, params);
    return rows.map(this.rowToItem);
  }

  private rowToItem(row: any): Item {
    return {
      id: row.id,
      name: row.name,
      year: row.year,
      rating: row.rating,
      genres: row.genres ? JSON.parse(row.genres) : [],
      description: row.description || '',
      categoryId: row.categoryId,
      path: row.path || '',
      addedDate: row.addedDate,
      coverPath: row.coverPath || '',
      orderIndex: row.orderIndex || 0,
    };
  }

  async getItemById(id: string): Promise<Item | null> {
    const rows = await this.sqlite!.query('SELECT * FROM items WHERE id = ?', [id]);
    return rows[0] ? this.rowToItem(rows[0]) : null;
  }

  async getItemCount(categoryId?: string): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM items';
    const params: any[] = [];
    
    if (categoryId && categoryId !== 'all') {
      sql += ' WHERE categoryId = ?';
      params.push(categoryId);
    }
    
    const rows = await this.sqlite!.query(sql, params);
    return rows[0]?.count || 0;
  }

  async addItem(item: Item): Promise<void> {
    await this.sqlite!.run(
      `INSERT INTO items (id, name, year, rating, genres, description, categoryId, path, addedDate, coverPath, orderIndex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.name, item.year, item.rating,
        JSON.stringify(item.genres), item.description,
        item.categoryId, item.path, item.addedDate,
        item.coverPath, item.orderIndex
      ]
    );
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) { setClauses.push('name = ?'); params.push(updates.name); }
    if (updates.year !== undefined) { setClauses.push('year = ?'); params.push(updates.year); }
    if (updates.rating !== undefined) { setClauses.push('rating = ?'); params.push(updates.rating); }
    if (updates.genres !== undefined) { setClauses.push('genres = ?'); params.push(JSON.stringify(updates.genres)); }
    if (updates.description !== undefined) { setClauses.push('description = ?'); params.push(updates.description); }
    if (updates.categoryId !== undefined) { setClauses.push('categoryId = ?'); params.push(updates.categoryId); }
    if (updates.path !== undefined) { setClauses.push('path = ?'); params.push(updates.path); }
    if (updates.coverPath !== undefined) { setClauses.push('coverPath = ?'); params.push(updates.coverPath); }
    if (updates.orderIndex !== undefined) { setClauses.push('orderIndex = ?'); params.push(updates.orderIndex); }

    if (setClauses.length === 0) return;

    params.push(id);
    await this.sqlite!.run(
      `UPDATE items SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );
  }

  async deleteItems(ids: string[]): Promise<void> {
    const placeholders = ids.map(() => '?').join(',');
    await this.sqlite!.run(`DELETE FROM items WHERE id IN (${placeholders})`, ids);
  }

  async getCategories(): Promise<Category[]> {
    const rows = await this.sqlite!.query('SELECT * FROM categories ORDER BY orderIndex');
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      orderIndex: row.orderIndex,
      icon: row.icon,
      emoji: row.emoji,
    }));
  }

  async addCategory(category: Category): Promise<void> {
    await this.sqlite!.run(
      `INSERT INTO categories (id, name, parentId, orderIndex, icon, emoji)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [category.id, category.name, category.parentId, category.orderIndex, category.icon, category.emoji]
    );
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) { setClauses.push('name = ?'); params.push(updates.name); }
    if (updates.parentId !== undefined) { setClauses.push('parentId = ?'); params.push(updates.parentId); }
    if (updates.orderIndex !== undefined) { setClauses.push('orderIndex = ?'); params.push(updates.orderIndex); }
    if (updates.icon !== undefined) { setClauses.push('icon = ?'); params.push(updates.icon); }
    if (updates.emoji !== undefined) { setClauses.push('emoji = ?'); params.push(updates.emoji); }

    if (setClauses.length === 0) return;

    params.push(id);
    await this.sqlite!.run(
      `UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );
  }

  async deleteCategory(id: string): Promise<void> {
    await this.sqlite!.run('DELETE FROM categories WHERE id = ?', [id]);
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
    await this.sqlite!.exec('DELETE FROM items');
    await this.sqlite!.exec('DELETE FROM categories');

    for (const category of data.categories) {
      await this.addCategory(category);
    }

    for (const item of data.items) {
      await this.addItem(item);
    }
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const info = await this.sqlite!.getInfo();
    
    return {
      type: 'sqlite',
      usedBytes: info.size,
      maxBytes: Number.MAX_SAFE_INTEGER, // Practically unlimited
      itemCount: info.itemCount,
      supportsLargeDatasets: true,
    };
  }
}
