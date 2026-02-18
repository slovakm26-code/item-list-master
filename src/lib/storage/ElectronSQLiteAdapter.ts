/**
 * Electron SQLite Storage Adapter
 * 
 * Uses native sqlite3 bindings running in Electron main process via IPC.
 * All SQL operations are proxied through window.electronDB.
 */
/// <reference path="../../types/electron.d.ts" />

import { StorageAdapter, QueryOptions, ExportData, StorageInfo, DatabaseStatistics } from './StorageAdapter';
import { AppState, Item, Category } from '@/types';

export class ElectronSQLiteAdapter implements StorageAdapter {
  private ready = false;

  async init(): Promise<void> {
    if (!window.electronDB) {
      throw new Error('ElectronDB API not available');
    }

    // Initialize schema (exec runs full SQL script)
    await window.electronDB.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
      PRAGMA mmap_size = 268435456;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        order_index INTEGER DEFAULT 0,
        icon TEXT,
        emoji TEXT,
        custom_fields TEXT,
        enabled_fields TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        year INTEGER,
        rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
        genres TEXT,
        description TEXT,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        path TEXT,
        added_date TEXT DEFAULT (datetime('now')),
        cover_path TEXT,
        order_index INTEGER DEFAULT 0,
        season INTEGER,
        episode INTEGER,
        watched INTEGER DEFAULT 0,
        favorite INTEGER DEFAULT 0,
        custom_field_values TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
      CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_items_year ON items(year);
      CREATE INDEX IF NOT EXISTS idx_items_rating ON items(rating DESC);
      CREATE INDEX IF NOT EXISTS idx_items_added ON items(added_date DESC);
      CREATE INDEX IF NOT EXISTS idx_items_order ON items(order_index);
      CREATE INDEX IF NOT EXISTS idx_items_cat_name ON items(category_id, name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_items_cat_year ON items(category_id, year DESC);
      CREATE INDEX IF NOT EXISTS idx_items_cat_rating ON items(category_id, rating DESC);
      CREATE INDEX IF NOT EXISTS idx_items_cat_order ON items(category_id, order_index);

      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        name, description, genres, path,
        content=items, content_rowid=rowid,
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER IF NOT EXISTS items_fts_insert AFTER INSERT ON items BEGIN
        INSERT INTO items_fts(rowid, name, description, genres, path)
        VALUES (NEW.rowid, NEW.name, NEW.description, NEW.genres, NEW.path);
      END;

      CREATE TRIGGER IF NOT EXISTS items_fts_delete AFTER DELETE ON items BEGIN
        INSERT INTO items_fts(items_fts, rowid, name, description, genres, path)
        VALUES('delete', OLD.rowid, OLD.name, OLD.description, OLD.genres, OLD.path);
      END;

      CREATE TRIGGER IF NOT EXISTS items_fts_update AFTER UPDATE ON items BEGIN
        INSERT INTO items_fts(items_fts, rowid, name, description, genres, path)
        VALUES('delete', OLD.rowid, OLD.name, OLD.description, OLD.genres, OLD.path);
        INSERT INTO items_fts(rowid, name, description, genres, path)
        VALUES (NEW.rowid, NEW.name, NEW.description, NEW.genres, NEW.path);
      END;

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.ready = true;
    console.log('ElectronSQLiteAdapter initialized');
  }

  isReady(): boolean {
    return this.ready;
  }

  // ============================================
  // ROW <-> OBJECT MAPPING
  // ============================================

  private rowToItem(row: any): Item {
    return {
      id: row.id,
      name: row.name,
      year: row.year,
      rating: row.rating,
      genres: row.genres ? JSON.parse(row.genres) : [],
      description: row.description || '',
      categoryId: row.category_id,
      path: row.path || '',
      addedDate: row.added_date || new Date().toISOString(),
      coverPath: row.cover_path || '',
      orderIndex: row.order_index || 0,
      season: row.season,
      episode: row.episode,
      watched: !!row.watched,
      customFieldValues: row.custom_field_values ? JSON.parse(row.custom_field_values) : undefined,
    };
  }

  private rowToCategory(row: any): Category {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      orderIndex: row.order_index || 0,
      icon: row.icon,
      emoji: row.emoji,
      customFields: row.custom_fields ? JSON.parse(row.custom_fields) : undefined,
      enabledFields: row.enabled_fields ? JSON.parse(row.enabled_fields) : undefined,
    };
  }

  // ============================================
  // FULL STATE OPERATIONS
  // ============================================

  async loadState(): Promise<AppState | null> {
    const categories = await this.getCategories();
    const items = await this.getItems();

    if (categories.length === 0 && items.length === 0) {
      return null;
    }

    return {
      categories,
      items,
      selectedCategoryId: 'all',
      selectedItemIds: [],
      searchQuery: '',
      sortColumn: 'name',
      sortDirection: 'asc',
      useManualOrder: false,
      customFieldFilters: [],
    };
  }

  async saveState(state: AppState): Promise<void> {
    const db = window.electronDB!;

    // Clear and re-insert everything in a transaction
    await db.exec('DELETE FROM items; DELETE FROM categories;');

    // Insert categories
    if (state.categories.length > 0) {
      await db.batchInsert(
        `INSERT OR REPLACE INTO categories (id, name, parent_id, order_index, icon, emoji, custom_fields, enabled_fields)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        state.categories.map(c => [
          c.id, c.name, c.parentId, c.orderIndex,
          c.icon || null, c.emoji || null,
          c.customFields ? JSON.stringify(c.customFields) : null,
          c.enabledFields ? JSON.stringify(c.enabledFields) : null,
        ])
      );
    }

    // Insert items
    if (state.items.length > 0) {
      await db.batchInsert(
        `INSERT OR REPLACE INTO items (id, name, year, rating, genres, description, category_id, path, added_date, cover_path, order_index, season, episode, watched, favorite, custom_field_values)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        state.items.map(i => [
          i.id, i.name, i.year, i.rating,
          JSON.stringify(i.genres), i.description,
          i.categoryId, i.path, i.addedDate,
          i.coverPath, i.orderIndex,
          i.season, i.episode,
          i.watched ? 1 : 0, 0,
          i.customFieldValues ? JSON.stringify(i.customFieldValues) : null,
        ])
      );
    }
  }

  // ============================================
  // ITEM OPERATIONS
  // ============================================

  async getItems(options?: QueryOptions): Promise<Item[]> {
    const db = window.electronDB!;
    let sql = 'SELECT * FROM items';
    const params: any[] = [];
    const conditions: string[] = [];

    if (options?.categoryId && options.categoryId !== 'all') {
      conditions.push('category_id = ?');
      params.push(options.categoryId);
    }

    if (options?.searchQuery && options.useFTS) {
      // Use FTS5
      sql = `SELECT items.* FROM items JOIN items_fts ON items.rowid = items_fts.rowid WHERE items_fts MATCH ?`;
      params.unshift(options.searchQuery + '*');
    } else if (options?.searchQuery) {
      const q = `%${options.searchQuery}%`;
      conditions.push('(name LIKE ? OR description LIKE ? OR genres LIKE ?)');
      params.push(q, q, q);
    }

    if (conditions.length > 0) {
      sql += (sql.includes('WHERE') ? ' AND ' : ' WHERE ') + conditions.join(' AND ');
    }

    // Sort
    if (options?.sortColumn) {
      const colMap: Record<string, string> = {
        name: 'name COLLATE NOCASE',
        year: 'year',
        rating: 'rating',
        addedDate: 'added_date',
        path: 'path',
        orderIndex: 'order_index',
      };
      const col = colMap[options.sortColumn as string] || 'name';
      const dir = options.sortDirection === 'desc' ? 'DESC' : 'ASC';
      sql += ` ORDER BY ${col} ${dir}`;
    } else {
      sql += ' ORDER BY name COLLATE NOCASE ASC';
    }

    // Pagination
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }

    const rows = await db.all(sql, params);
    return rows.map(r => this.rowToItem(r));
  }

  async getItemById(id: string): Promise<Item | null> {
    const row = await window.electronDB!.get('SELECT * FROM items WHERE id = ?', [id]);
    return row ? this.rowToItem(row) : null;
  }

  async getItemCount(categoryId?: string): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM items';
    const params: any[] = [];
    if (categoryId && categoryId !== 'all') {
      sql += ' WHERE category_id = ?';
      params.push(categoryId);
    }
    const row = await window.electronDB!.get(sql, params);
    return row?.count || 0;
  }

  async addItem(item: Item): Promise<void> {
    await window.electronDB!.run(
      `INSERT INTO items (id, name, year, rating, genres, description, category_id, path, added_date, cover_path, order_index, season, episode, watched, favorite, custom_field_values)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.name, item.year, item.rating,
        JSON.stringify(item.genres), item.description,
        item.categoryId, item.path, item.addedDate,
        item.coverPath, item.orderIndex,
        item.season, item.episode,
        item.watched ? 1 : 0, 0,
        item.customFieldValues ? JSON.stringify(item.customFieldValues) : null,
      ]
    );
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const setClauses: string[] = [];
    const params: any[] = [];

    const fieldMap: Record<string, string> = {
      name: 'name', year: 'year', rating: 'rating',
      description: 'description', categoryId: 'category_id',
      path: 'path', coverPath: 'cover_path', orderIndex: 'order_index',
      season: 'season', episode: 'episode',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${col} = ?`);
        params.push((updates as any)[key]);
      }
    }

    if ('genres' in updates) {
      setClauses.push('genres = ?');
      params.push(JSON.stringify(updates.genres));
    }
    if ('watched' in updates) {
      setClauses.push('watched = ?');
      params.push(updates.watched ? 1 : 0);
    }
    if ('customFieldValues' in updates) {
      setClauses.push('custom_field_values = ?');
      params.push(updates.customFieldValues ? JSON.stringify(updates.customFieldValues) : null);
    }

    if (setClauses.length === 0) return;

    params.push(id);
    await window.electronDB!.run(
      `UPDATE items SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );
  }

  async deleteItems(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await window.electronDB!.run(`DELETE FROM items WHERE id IN (${placeholders})`, ids);

    // Delete associated images
    if (window.electronImages) {
      for (const id of ids) {
        try { await window.electronImages.delete(id); } catch {}
      }
    }
  }

  async addItems(items: Item[], onProgress?: (count: number) => void): Promise<void> {
    const db = window.electronDB!;
    const BATCH_SIZE = 5000;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await db.batchInsert(
        `INSERT OR REPLACE INTO items (id, name, year, rating, genres, description, category_id, path, added_date, cover_path, order_index, season, episode, watched, favorite, custom_field_values)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        batch.map(item => [
          item.id, item.name, item.year, item.rating,
          JSON.stringify(item.genres), item.description,
          item.categoryId, item.path, item.addedDate,
          item.coverPath, item.orderIndex,
          item.season, item.episode,
          item.watched ? 1 : 0, 0,
          item.customFieldValues ? JSON.stringify(item.customFieldValues) : null,
        ])
      );
      onProgress?.(Math.min(i + BATCH_SIZE, items.length));
    }
  }

  // ============================================
  // CATEGORY OPERATIONS
  // ============================================

  async getCategories(): Promise<Category[]> {
    const rows = await window.electronDB!.all('SELECT * FROM categories ORDER BY order_index');
    return rows.map(r => this.rowToCategory(r));
  }

  async addCategory(category: Category): Promise<void> {
    await window.electronDB!.run(
      `INSERT INTO categories (id, name, parent_id, order_index, icon, emoji, custom_fields, enabled_fields)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category.id, category.name, category.parentId, category.orderIndex,
        category.icon || null, category.emoji || null,
        category.customFields ? JSON.stringify(category.customFields) : null,
        category.enabledFields ? JSON.stringify(category.enabledFields) : null,
      ]
    );
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    const setClauses: string[] = [];
    const params: any[] = [];

    const fieldMap: Record<string, string> = {
      name: 'name', parentId: 'parent_id', orderIndex: 'order_index',
      icon: 'icon', emoji: 'emoji',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${col} = ?`);
        params.push((updates as any)[key]);
      }
    }

    if ('customFields' in updates) {
      setClauses.push('custom_fields = ?');
      params.push(updates.customFields ? JSON.stringify(updates.customFields) : null);
    }
    if ('enabledFields' in updates) {
      setClauses.push('enabled_fields = ?');
      params.push(updates.enabledFields ? JSON.stringify(updates.enabledFields) : null);
    }

    if (setClauses.length === 0) return;

    params.push(id);
    await window.electronDB!.run(
      `UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );
  }

  async deleteCategory(id: string): Promise<void> {
    // Items are CASCADE deleted by FK
    await window.electronDB!.run('DELETE FROM categories WHERE id = ?', [id]);
  }

  // ============================================
  // SEARCH (FTS5)
  // ============================================

  async searchItems(query: string, categoryId?: string): Promise<Item[]> {
    return this.getItems({
      searchQuery: query,
      categoryId,
      useFTS: true,
    });
  }

  async fullTextSearch(query: string, options?: { categoryId?: string; limit?: number }): Promise<Item[]> {
    let sql = `SELECT items.* FROM items JOIN items_fts ON items.rowid = items_fts.rowid WHERE items_fts MATCH ?`;
    const params: any[] = [query + '*'];

    if (options?.categoryId) {
      sql += ' AND items.category_id = ?';
      params.push(options.categoryId);
    }
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    const rows = await window.electronDB!.all(sql, params);
    return rows.map(r => this.rowToItem(r));
  }

  // ============================================
  // EXPORT/IMPORT
  // ============================================

  async exportData(): Promise<ExportData> {
    const categories = await this.getCategories();
    const items = await this.getItems();
    return {
      version: 5,
      exportDate: new Date().toISOString(),
      categories,
      items,
    };
  }

  async importData(data: ExportData, onProgress?: (count: number) => void): Promise<void> {
    const db = window.electronDB!;

    // Clear existing data
    await db.exec('DELETE FROM items; DELETE FROM categories;');

    // Insert categories
    if (data.categories?.length) {
      await db.batchInsert(
        `INSERT INTO categories (id, name, parent_id, order_index, icon, emoji, custom_fields, enabled_fields)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        data.categories.map(c => [
          c.id, c.name, c.parentId, c.orderIndex,
          c.icon || null, c.emoji || null,
          c.customFields ? JSON.stringify(c.customFields) : null,
          c.enabledFields ? JSON.stringify(c.enabledFields) : null,
        ])
      );
    }

    // Insert items in batches
    if (data.items?.length) {
      await this.addItems(data.items, onProgress);
    }
  }

  // ============================================
  // RAW DATABASE
  // ============================================

  exportDatabase(): Uint8Array | null {
    // Async only - use exportDB() via IPC
    return null;
  }

  async exportDatabaseAsync(): Promise<Uint8Array> {
    return window.electronDB!.exportDB();
  }

  async importDatabase(data: Uint8Array): Promise<void> {
    await window.electronDB!.importDB(data);
    // Re-init after import
    this.ready = false;
    await this.init();
  }

  // ============================================
  // MAINTENANCE
  // ============================================

  async vacuum(): Promise<void> {
    await window.electronDB!.exec('VACUUM;');
  }

  async optimize(): Promise<void> {
    await window.electronDB!.exec("INSERT INTO items_fts(items_fts) VALUES('optimize');");
  }

  // ============================================
  // STATISTICS
  // ============================================

  async getStatistics(): Promise<DatabaseStatistics> {
    const db = window.electronDB!;

    const countRow = await db.get('SELECT COUNT(*) as count FROM items');
    const catCountRow = await db.get('SELECT COUNT(*) as count FROM categories');
    const avgRow = await db.get('SELECT AVG(rating) as avg FROM items WHERE rating IS NOT NULL');

    const perCat = await db.all('SELECT category_id, COUNT(*) as count FROM items GROUP BY category_id');
    const byYear = await db.all('SELECT year, COUNT(*) as count FROM items WHERE year IS NOT NULL GROUP BY year');

    const itemsPerCategory: Record<string, number> = {};
    for (const r of perCat) itemsPerCategory[r.category_id] = r.count;

    const itemsByYear: Record<number, number> = {};
    for (const r of byYear) itemsByYear[r.year] = r.count;

    const info = await db.getInfo();

    return {
      totalItems: countRow?.count || 0,
      totalCategories: catCountRow?.count || 0,
      databaseSizeBytes: info.size,
      itemsPerCategory,
      averageRating: avgRow?.avg || null,
      itemsByYear,
    };
  }

  // ============================================
  // STORAGE INFO
  // ============================================

  async getStorageInfo(): Promise<StorageInfo> {
    const info = await window.electronDB!.getInfo();
    const countRow = await window.electronDB!.get('SELECT COUNT(*) as count FROM items');

    return {
      type: 'sqlite',
      usedBytes: info.size,
      maxBytes: Infinity,
      itemCount: countRow?.count || 0,
      supportsLargeDatasets: true,
      walMode: true,
      ftsEnabled: true,
    };
  }
}
