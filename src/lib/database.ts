import { Category, Item, DatabaseExport, AppState } from '@/types';

const DB_KEY = 'stuff_organizer_db';
const BACKUP_PREFIX = 'stuff_organizer_backup_';

// Generate unique ID
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Get current timestamp for backup names
export const getTimestamp = (): string => {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
};

// Default categories with icons
const defaultCategories: Category[] = [
  { id: 'all', name: 'All Items', parentId: null, orderIndex: 0, icon: 'folder' },
  { id: 'movies', name: 'Movies', parentId: null, orderIndex: 1, icon: 'film' },
  { id: 'series', name: 'Series', parentId: null, orderIndex: 2, icon: 'tv' },
  { id: 'games', name: 'Games', parentId: null, orderIndex: 3, icon: 'gamepad2' },
  { id: 'music', name: 'Music', parentId: null, orderIndex: 4, icon: 'music' },
  { id: 'books', name: 'E-books', parentId: null, orderIndex: 5, icon: 'book-open' },
  { id: 'apps', name: 'Applications', parentId: null, orderIndex: 6, icon: 'package' },
];

// Sample items for demo
const sampleItems: Item[] = [
  {
    id: generateId(),
    name: 'The Shawshank Redemption',
    year: 1994,
    rating: 9.3,
    genres: ['Drama'],
    description: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.',
    categoryId: 'movies',
    path: 'C:\\Movies\\The Shawshank Redemption',
    addedDate: new Date().toISOString(),
    coverPath: '',
    orderIndex: 0,
    season: null,
    episode: null,
    watched: true,
  },
  {
    id: generateId(),
    name: 'Breaking Bad',
    year: 2008,
    rating: 9.5,
    genres: ['Crime', 'Drama', 'Thriller'],
    description: 'A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine.',
    categoryId: 'series',
    path: 'C:\\Series\\Breaking Bad',
    addedDate: new Date().toISOString(),
    coverPath: '',
    orderIndex: 0,
    season: 5,
    episode: 16,
    watched: true,
  },
  {
    id: generateId(),
    name: 'The Witcher 3: Wild Hunt',
    year: 2015,
    rating: 9.2,
    genres: ['RPG', 'Action', 'Adventure'],
    description: 'Geralt of Rivia, a monster hunter, sets out to find his adopted daughter who is on the run from the Wild Hunt.',
    categoryId: 'games',
    path: 'C:\\Games\\The Witcher 3',
    addedDate: new Date().toISOString(),
    coverPath: '',
    orderIndex: 0,
    season: null,
    episode: null,
    watched: false,
  },
];

// Initialize database with defaults if empty
export const initDatabase = (): AppState => {
  const stored = localStorage.getItem(DB_KEY);
  
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Migrate old categories to add emoji if missing
      const migratedCategories = parsed.categories.map((cat: Category) => {
        if (!cat.emoji) {
          const defaultCat = defaultCategories.find(d => d.id === cat.id);
          return { ...cat, emoji: defaultCat?.emoji || '📁' };
        }
        return cat;
      });
      return { ...parsed, categories: migratedCategories };
    } catch {
      console.error('Failed to parse database, initializing with defaults');
    }
  }
  
  const initialState: AppState = {
    categories: defaultCategories,
    items: sampleItems,
    selectedCategoryId: 'all',
    selectedItemIds: [],
    searchQuery: '',
    sortColumn: 'name',
    sortDirection: 'asc',
    useManualOrder: false,
  };
  
  saveDatabase(initialState);
  return initialState;
};

// Save database to localStorage
export const saveDatabase = (state: AppState): void => {
  localStorage.setItem(DB_KEY, JSON.stringify(state));
};

// Create automatic backup
export const createBackup = (): string => {
  const state = localStorage.getItem(DB_KEY);
  if (!state) return '';
  
  const timestamp = getTimestamp();
  const backupKey = `${BACKUP_PREFIX}${timestamp}`;
  localStorage.setItem(backupKey, state);
  
  // Keep only last 5 backups
  cleanOldBackups();
  
  return backupKey;
};

// Get list of backups
export const getBackups = (): string[] => {
  const backups: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(BACKUP_PREFIX)) {
      backups.push(key);
    }
  }
  return backups.sort().reverse();
};

// Clean old backups (keep last 5)
const cleanOldBackups = (): void => {
  const backups = getBackups();
  if (backups.length > 5) {
    backups.slice(5).forEach(key => localStorage.removeItem(key));
  }
};

// Export database to JSON
export const exportDatabase = (): DatabaseExport => {
  const state = initDatabase();
  return {
    version: 1,
    exportDate: new Date().toISOString(),
    categories: state.categories,
    items: state.items,
  };
};

// Export to downloadable file
export const downloadExport = (): void => {
  const data = exportDatabase();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stuff_organizer_export_${getTimestamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Import database from file
export const importDatabase = (file: File): Promise<AppState> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as DatabaseExport;
        
        // Create backup before import
        createBackup();
        
        // Validate and import
        if (!data.categories || !data.items) {
          throw new Error('Invalid database file format');
        }
        
        const currentState = initDatabase();
        const newState: AppState = {
          ...currentState,
          categories: data.categories,
          items: data.items,
        };
        
        saveDatabase(newState);
        resolve(newState);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

// Restore from backup
export const restoreBackup = (backupKey: string): AppState | null => {
  const backup = localStorage.getItem(backupKey);
  if (!backup) return null;
  
  // Create backup of current state before restoring
  createBackup();
  
  try {
    const state = JSON.parse(backup) as AppState;
    saveDatabase(state);
    return state;
  } catch {
    return null;
  }
};

// Delete a backup
export const deleteBackup = (backupKey: string): void => {
  localStorage.removeItem(backupKey);
};
