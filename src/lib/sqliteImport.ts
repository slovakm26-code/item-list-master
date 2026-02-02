/**
 * SQLite .backup import module using sql.js
 * Parses SQLite backup files and extracts items data
 */

import initSqlJs, { Database } from 'sql.js';
import { Item, Category } from '@/types';
import { generateId } from './database';

// Initialize SQL.js with WASM
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

const initSQL = async (): Promise<typeof SQL> => {
  if (!SQL) {
    SQL = await initSqlJs({
      // Load WASM from CDN
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });
  }
  return SQL;
};

// Validate if file is a valid SQLite database
export const validateSQLiteFile = async (file: File): Promise<boolean> => {
  try {
    const buffer = await file.arrayBuffer();
    const header = new Uint8Array(buffer.slice(0, 16));
    
    // SQLite files start with "SQLite format 3\0"
    const sqliteHeader = [83, 81, 76, 105, 116, 101, 32, 102, 111, 114, 109, 97, 116, 32, 51, 0];
    
    for (let i = 0; i < 16; i++) {
      if (header[i] !== sqliteHeader[i]) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
};

// Common table/column name variations in media organizers
const TABLE_NAMES = ['Items', 'items', 'ITEMS', 'Movies', 'movies', 'Media', 'media', 'Content', 'content'];
const COLUMN_MAPPINGS: Record<string, string[]> = {
  name: ['Name', 'name', 'NAME', 'Title', 'title', 'TITLE'],
  year: ['Year', 'year', 'YEAR', 'ReleaseYear', 'release_year'],
  rating: ['Rating', 'rating', 'RATING', 'Score', 'score'],
  path: ['Path', 'path', 'PATH', 'FilePath', 'file_path', 'Location', 'location'],
  genres: ['Genres', 'genres', 'GENRES', 'Genre', 'genre', 'Category', 'category'],
  description: ['Description', 'description', 'DESCRIPTION', 'Synopsis', 'synopsis', 'Plot', 'plot'],
  coverPath: ['CoverPath', 'cover_path', 'Cover', 'cover', 'Poster', 'poster', 'Image', 'image'],
  addedDate: ['AddedDate', 'added_date', 'DateAdded', 'date_added', 'CreatedAt', 'created_at'],
};

interface SQLiteRow {
  [key: string]: unknown;
}

// Find matching column in result
const findColumn = (columns: string[], mappings: string[]): string | null => {
  for (const mapping of mappings) {
    if (columns.includes(mapping)) {
      return mapping;
    }
  }
  return null;
};

// Parse SQLite backup file and extract items
export const parseSQLiteBackup = async (
  file: File,
  targetCategoryId: string = 'movies'
): Promise<{ items: Item[]; categories: Category[] }> => {
  // Validate file first
  const isValid = await validateSQLiteFile(file);
  if (!isValid) {
    throw new Error('Invalid SQLite database file. Please ensure the file is a valid .backup or .db file.');
  }
  
  try {
    const sql = await initSQL();
    if (!sql) {
      throw new Error('Failed to initialize SQL.js');
    }
    
    const buffer = await file.arrayBuffer();
    const db: Database = new sql.Database(new Uint8Array(buffer));
    
    // Get list of tables
    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (!tablesResult.length || !tablesResult[0].values.length) {
      throw new Error('No tables found in database');
    }
    
    const tableNames = tablesResult[0].values.map(row => row[0] as string);
    
    // Find items table
    let itemsTableName: string | null = null;
    for (const name of TABLE_NAMES) {
      if (tableNames.includes(name)) {
        itemsTableName = name;
        break;
      }
    }
    
    // If no standard table found, use first table
    if (!itemsTableName && tableNames.length > 0) {
      itemsTableName = tableNames[0];
    }
    
    if (!itemsTableName) {
      throw new Error('Could not find items table in database');
    }
    
    // Get table schema
    const schemaResult = db.exec(`PRAGMA table_info(${itemsTableName})`);
    if (!schemaResult.length) {
      throw new Error(`Could not read schema for table ${itemsTableName}`);
    }
    
    const columns = schemaResult[0].values.map(row => row[1] as string);
    
    // Map columns
    const columnMap: Record<string, string | null> = {};
    for (const [key, mappings] of Object.entries(COLUMN_MAPPINGS)) {
      columnMap[key] = findColumn(columns, mappings);
    }
    
    // Query all rows
    const dataResult = db.exec(`SELECT * FROM ${itemsTableName}`);
    if (!dataResult.length) {
      db.close();
      return { items: [], categories: [] };
    }
    
    const rows: SQLiteRow[] = dataResult[0].values.map(row => {
      const obj: SQLiteRow = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
    
    // Convert rows to items
    const items: Item[] = rows.map((row, index) => {
      const getValue = (key: string): unknown => {
        const col = columnMap[key];
        return col ? row[col] : null;
      };
      
      const name = getValue('name');
      const year = getValue('year');
      const rating = getValue('rating');
      const path = getValue('path');
      const genres = getValue('genres');
      const description = getValue('description');
      const coverPath = getValue('coverPath');
      const addedDate = getValue('addedDate');
      
      return {
        id: generateId(),
        name: typeof name === 'string' ? name : `Item ${index + 1}`,
        year: typeof year === 'number' ? year : (typeof year === 'string' ? parseInt(year) || null : null),
        rating: typeof rating === 'number' ? rating : (typeof rating === 'string' ? parseFloat(rating) || null : null),
        genres: typeof genres === 'string' ? genres.split(',').map(g => g.trim()).filter(Boolean) : [],
        description: typeof description === 'string' ? description : '',
        categoryId: targetCategoryId,
        path: typeof path === 'string' ? path : '',
        addedDate: typeof addedDate === 'string' ? addedDate : new Date().toISOString(),
        coverPath: typeof coverPath === 'string' ? coverPath : '',
        orderIndex: index,
      };
    });
    
    db.close();
    
    return {
      items,
      categories: [], // Categories would need separate table parsing
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to parse SQLite database');
  }
};

// Get table info from SQLite file (for debugging/preview)
export const getSQLiteTableInfo = async (file: File): Promise<{
  tables: string[];
  rowCounts: Record<string, number>;
}> => {
  const isValid = await validateSQLiteFile(file);
  if (!isValid) {
    throw new Error('Invalid SQLite database file');
  }
  
  const sql = await initSQL();
  if (!sql) {
    throw new Error('Failed to initialize SQL.js');
  }
  
  const buffer = await file.arrayBuffer();
  const db: Database = new sql.Database(new Uint8Array(buffer));
  
  const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = tablesResult.length ? tablesResult[0].values.map(row => row[0] as string) : [];
  
  const rowCounts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const countResult = db.exec(`SELECT COUNT(*) FROM ${table}`);
      rowCounts[table] = countResult.length ? (countResult[0].values[0][0] as number) : 0;
    } catch {
      rowCounts[table] = 0;
    }
  }
  
  db.close();
  
  return { tables, rowCounts };
};
