-- ============================================
-- STUFF ORGANIZER - SQLite Schema v4
-- Kompletná schéma pre SQLite-only úložisko
-- ============================================

-- Pragma nastavenia pre výkon
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;  -- 64MB cache
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456; -- 256MB memory-mapped I/O
PRAGMA foreign_keys = ON;

-- ============================================
-- TABUĽKA: categories
-- Hierarchické kategórie s custom fields
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  order_index INTEGER DEFAULT 0,
  icon TEXT,
  emoji TEXT,
  -- JSON pole pre definície custom fields
  custom_fields TEXT, -- JSON: [{id, name, type, required, options, min, max}]
  -- JSON pole pre zapnuté/vypnuté built-in fields
  enabled_fields TEXT, -- JSON: {year: true, rating: true, ...}
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(order_index);

-- ============================================
-- TABUĽKA: items
-- Hlavná tabuľka pre všetky položky (filmy, hry, knihy...)
-- ============================================
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER,
  rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
  genres TEXT, -- JSON array: ["Action", "Drama"]
  description TEXT,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  path TEXT,
  added_date TEXT DEFAULT (datetime('now')),
  cover_path TEXT,
  order_index INTEGER DEFAULT 0,
  -- Series-specific
  season INTEGER,
  episode INTEGER,
  -- Status
  watched INTEGER DEFAULT 0, -- 0=false, 1=true
  favorite INTEGER DEFAULT 0,
  -- Custom field values
  custom_field_values TEXT, -- JSON: {fieldId: value, ...}
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Základné indexy
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_items_year ON items(year);
CREATE INDEX IF NOT EXISTS idx_items_rating ON items(rating DESC);
CREATE INDEX IF NOT EXISTS idx_items_added ON items(added_date DESC);
CREATE INDEX IF NOT EXISTS idx_items_order ON items(order_index);
CREATE INDEX IF NOT EXISTS idx_items_watched ON items(watched);
CREATE INDEX IF NOT EXISTS idx_items_favorite ON items(favorite);

-- Kompozitné indexy pre bežné queries
CREATE INDEX IF NOT EXISTS idx_items_cat_name ON items(category_id, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_items_cat_year ON items(category_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_items_cat_rating ON items(category_id, rating DESC);
CREATE INDEX IF NOT EXISTS idx_items_cat_order ON items(category_id, order_index);

-- ============================================
-- TABUĽKA: tags
-- Flexibilný tagging systém
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT, -- HEX color
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name COLLATE NOCASE);

-- ============================================
-- TABUĽKA: item_tags
-- Many-to-many vzťah medzi items a tags
-- ============================================
CREATE TABLE IF NOT EXISTS item_tags (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_item_tags_item ON item_tags(item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);

-- ============================================
-- TABUĽKA: notes
-- Poznámky k položkám
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_item ON notes(item_id);

-- ============================================
-- TABUĽKA: settings
-- Aplikačné nastavenia (key-value)
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- TABUĽKA: ui_state
-- Stav UI (výber, triedenie, atď.)
-- ============================================
CREATE TABLE IF NOT EXISTS ui_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================
-- FTS5: Full-Text Search
-- Bleskové vyhľadávanie (<10ms na 1M položiek)
-- ============================================
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  name,
  description,
  genres,
  path,
  content=items,
  content_rowid=rowid,
  tokenize='unicode61 remove_diacritics 2'
);

-- Triggery pre synchronizáciu FTS
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

-- ============================================
-- TABUĽKA: schema_version
-- Pre migrácie
-- ============================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (4);

-- ============================================
-- TRIGGERY: Auto-update timestamps
-- ============================================
CREATE TRIGGER IF NOT EXISTS items_updated AFTER UPDATE ON items BEGIN
  UPDATE items SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS categories_updated AFTER UPDATE ON categories BEGIN
  UPDATE categories SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS notes_updated AFTER UPDATE ON notes BEGIN
  UPDATE notes SET updated_at = datetime('now') WHERE id = NEW.id;
END;
