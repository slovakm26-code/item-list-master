/**
 * Web SQLite Storage Adapter using sql.js
 * 
 * Uses sql.js (SQLite compiled to WebAssembly) for fast querying
 * and persists the database to IndexedDB as a binary blob.
 */

import initSqlJs, { Database } from 'sql.js';
import { AppState, Item, Category } from '@/types';
import { StorageAdapter, QueryOptions, ExportData, StorageInfo } from './StorageAdapter';

const DB_NAME = 'stuff-organizer-sqlite';
const DB_STORE = 'database';

export class WebSQLiteAdapter implements StorageAdapter {
  private db: Database | null = null;
  private ready = false;

  async init(): Promise<void> {
    // Initialize sql.js with WASM
    const SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`
    });

    // Try to load existing database from IndexedDB
    const savedData = await this.loadFromIndexedDB();
    
    if (savedData) {
      this.db = new SQL.Database(savedData);
    } else {
      this.db = new SQL.Database();
      await this.createTables();
    }

    this.ready = true;
  }

  private async createTables(): Promise<void> {
    if (!this.db) return;

    this.db.run(`
      -- Categories table
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parentId TEXT,
        orderIndex INTEGER DEFAULT 0,
        icon TEXT,
        emoji TEXT
      );

      -- Items table
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
        orderIndex INTEGER DEFAULT 0
      );
      
      -- Indexes for fast querying
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(categoryId);
      CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
      CREATE INDEX IF NOT EXISTS idx_items_year ON items(year);
      CREATE INDEX IF NOT EXISTS idx_items_rating ON items(rating);
      CREATE INDEX IF NOT EXISTS idx_items_order ON items(orderIndex);

      -- App state table
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    await this.persist();
  }

  private async loadFromIndexedDB(): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      
      request.onerror = () => resolve(null);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(DB_STORE, 'readonly');
        const store = transaction.objectStore(DB_STORE);
        const getRequest = store.get('main');
        
        getRequest.onsuccess = () => {
          resolve(getRequest.result || null);
        };
        getRequest.onerror = () => resolve(null);
      };
    });
  }

  private async persist(): Promise<void> {
    if (!this.db) return;

    const data = this.db.export();
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(DB_STORE, 'readwrite');
        const store = transaction.objectStore(DB_STORE);
        store.put(data, 'main');
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }

  isReady(): boolean {
    return this.ready && !!this.db;
  }

  async loadState(): Promise<AppState | null> {
    if (!this.db) return null;

    const categories = await this.getCategories();
    const items = await this.getItems();
    
    const stateResult = this.db.exec(
      "SELECT value FROM app_state WHERE key = 'uiState'"
    );
    
    const uiState = stateResult[0]?.values[0]?.[0] 
      ? JSON.parse(stateResult[0].values[0][0] as string) 
      : {};

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
    if (!this.db) return;

    // Clear and save categories
    this.db.run('DELETE FROM categories');
    const catStmt = this.db.prepare(
      'INSERT INTO categories (id, name, parentId, orderIndex, icon, emoji) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const cat of state.categories) {
      catStmt.run([cat.id, cat.name, cat.parentId, cat.orderIndex, cat.icon || null, cat.emoji || null]);
    }
    catStmt.free();

    // Clear and save items
    this.db.run('DELETE FROM items');
    const itemStmt = this.db.prepare(
      `INSERT INTO items (id, name, year, rating, genres, description, categoryId, path, addedDate, coverPath, orderIndex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of state.items) {
      itemStmt.run([
        item.id, item.name, item.year, item.rating,
        JSON.stringify(item.genres), item.description,
        item.categoryId, item.path, item.addedDate,
        item.coverPath, item.orderIndex
      ]);
    }
    itemStmt.free();

    // Save UI state
    this.db.run(
      "INSERT OR REPLACE INTO app_state (key, value) VALUES ('uiState', ?)",
      [JSON.stringify({
        selectedCategoryId: state.selectedCategoryId,
        selectedItemIds: state.selectedItemIds,
        searchQuery: state.searchQuery,
        sortColumn: state.sortColumn,
        sortDirection: state.sortDirection,
        useManualOrder: state.useManualOrder,
      })]
    );

    await this.persist();
  }

  async getItems(options?: QueryOptions): Promise<Item[]> {
    if (!this.db) return [];

    let sql = 'SELECT * FROM items WHERE 1=1';
    const params: any[] = [];

    if (options?.categoryId && options.categoryId !== 'all') {
      sql += ' AND categoryId = ?';
      params.push(options.categoryId);
    }

    if (options?.searchQuery) {
      sql += ' AND (name LIKE ? OR description LIKE ? OR genres LIKE ?)';
      const searchPattern = `%${options.searchQuery}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (options?.sortColumn) {
      const direction = options.sortDirection === 'desc' ? 'DESC' : 'ASC';
      sql += ` ORDER BY ${options.sortColumn} ${direction}`;
    }

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const result = this.db.exec(sql, params);
    if (!result[0]) return [];

    const columns = result[0].columns;
    return result[0].values.map(row => this.rowToItem(columns, row));
  }

  private rowToItem(columns: string[], row: any[]): Item {
    const obj: any = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    
    return {
      id: obj.id,
      name: obj.name,
      year: obj.year,
      rating: obj.rating,
      genres: obj.genres ? JSON.parse(obj.genres) : [],
      description: obj.description || '',
      categoryId: obj.categoryId,
      path: obj.path || '',
      addedDate: obj.addedDate,
      coverPath: obj.coverPath || '',
      orderIndex: obj.orderIndex || 0,
    };
  }

  async getItemById(id: string): Promise<Item | null> {
    if (!this.db) return null;

    const result = this.db.exec('SELECT * FROM items WHERE id = ?', [id]);
    if (!result[0]?.values[0]) return null;
    
    return this.rowToItem(result[0].columns, result[0].values[0]);
  }

  async getItemCount(categoryId?: string): Promise<number> {
    if (!this.db) return 0;

    let sql = 'SELECT COUNT(*) as count FROM items';
    const params: any[] = [];
    
    if (categoryId && categoryId !== 'all') {
      sql += ' WHERE categoryId = ?';
      params.push(categoryId);
    }
    
    const result = this.db.exec(sql, params);
    return (result[0]?.values[0]?.[0] as number) || 0;
  }

  async addItem(item: Item): Promise<void> {
    if (!this.db) return;

    this.db.run(
      `INSERT INTO items (id, name, year, rating, genres, description, categoryId, path, addedDate, coverPath, orderIndex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.name, item.year, item.rating,
        JSON.stringify(item.genres), item.description,
        item.categoryId, item.path, item.addedDate,
        item.coverPath, item.orderIndex
      ]
    );
    await this.persist();
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    if (!this.db) return;

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
    this.db.run(`UPDATE items SET ${setClauses.join(', ')} WHERE id = ?`, params);
    await this.persist();
  }

  async deleteItems(ids: string[]): Promise<void> {
    if (!this.db) return;

    const placeholders = ids.map(() => '?').join(',');
    this.db.run(`DELETE FROM items WHERE id IN (${placeholders})`, ids);
    await this.persist();
  }

  async getCategories(): Promise<Category[]> {
    if (!this.db) return [];

    const result = this.db.exec('SELECT * FROM categories ORDER BY orderIndex');
    if (!result[0]) return [];

    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: any = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return {
        id: obj.id,
        name: obj.name,
        parentId: obj.parentId,
        orderIndex: obj.orderIndex,
        icon: obj.icon,
        emoji: obj.emoji,
      };
    });
  }

  async addCategory(category: Category): Promise<void> {
    if (!this.db) return;

    this.db.run(
      'INSERT INTO categories (id, name, parentId, orderIndex, icon, emoji) VALUES (?, ?, ?, ?, ?, ?)',
      [category.id, category.name, category.parentId, category.orderIndex, category.icon || null, category.emoji || null]
    );
    await this.persist();
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    if (!this.db) return;

    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) { setClauses.push('name = ?'); params.push(updates.name); }
    if (updates.parentId !== undefined) { setClauses.push('parentId = ?'); params.push(updates.parentId); }
    if (updates.orderIndex !== undefined) { setClauses.push('orderIndex = ?'); params.push(updates.orderIndex); }
    if (updates.icon !== undefined) { setClauses.push('icon = ?'); params.push(updates.icon); }
    if (updates.emoji !== undefined) { setClauses.push('emoji = ?'); params.push(updates.emoji); }

    if (setClauses.length === 0) return;

    params.push(id);
    this.db.run(`UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`, params);
    await this.persist();
  }

  async deleteCategory(id: string): Promise<void> {
    if (!this.db) return;

    this.db.run('DELETE FROM categories WHERE id = ?', [id]);
    await this.persist();
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
    if (!this.db) return;

    this.db.run('DELETE FROM items');
    this.db.run('DELETE FROM categories');

    for (const category of data.categories) {
      await this.addCategory(category);
    }

    for (const item of data.items) {
      await this.addItem(item);
    }
  }

  async getStorageInfo(): Promise<StorageInfo> {
    if (!this.db) {
      return { type: 'sqlite', usedBytes: 0, maxBytes: 500 * 1024 * 1024, itemCount: 0, supportsLargeDatasets: true };
    }

    const data = this.db.export();
    const itemCount = await this.getItemCount();
    
    return {
      type: 'sqlite',
      usedBytes: data.length,
      maxBytes: 500 * 1024 * 1024, // 500MB reasonable limit for IndexedDB
      itemCount,
      supportsLargeDatasets: true,
    };
  }

  /**
   * Get raw database as Uint8Array for backup
   */
  exportDatabase(): Uint8Array | null {
    return this.db?.export() || null;
  }

  /**
   * Import raw database from Uint8Array
   */
  async importDatabase(data: Uint8Array): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`
    });
    
    this.db = new SQL.Database(data);
    await this.persist();
  }
}
