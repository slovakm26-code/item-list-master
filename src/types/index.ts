// Custom field types for dynamic category-specific fields
export type CustomFieldType = 'text' | 'number' | 'checkbox' | 'select' | 'date';

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: CustomFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[]; // For 'select' type
  min?: number; // For 'number' type
  max?: number; // For 'number' type
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  orderIndex: number;
  icon?: string;
  emoji?: string;
  // Custom fields specific to this category
  customFields?: CustomFieldDefinition[];
  // Which built-in fields to show (default: all)
  enabledFields?: {
    year?: boolean;
    rating?: boolean;
    genres?: boolean;
    season?: boolean;
    episode?: boolean;
    watched?: boolean;
    path?: boolean;
    description?: boolean;
  };
}

export interface Item {
  id: string;
  name: string;
  year: number | null;
  rating: number | null;
  genres: string[];
  description: string;
  categoryId: string;
  path: string;
  addedDate: string;
  coverPath: string;
  orderIndex: number;
  // Series-specific fields
  season: number | null;
  episode: number | null;
  // Watch status
  watched: boolean;
  // Custom field values (fieldId -> value)
  customFieldValues?: Record<string, string | number | boolean>;
}

export interface ColumnWidth {
  key: string;
  width: number;
}

export interface UIPreferences {
  columnWidths: ColumnWidth[];
  detailPanelHeight: number;
  detailPanelVisible: boolean;
}

export interface AppState {
  categories: Category[];
  items: Item[];
  selectedCategoryId: string | null;
  selectedItemIds: string[];
  searchQuery: string;
  sortColumn: keyof Item | null;
  sortDirection: 'asc' | 'desc';
  useManualOrder: boolean;
}

export interface DatabaseExport {
  version: number;
  exportDate: string;
  categories: Category[];
  items: Item[];
  images?: Record<string, string>; // itemId -> base64 image data
}

export type SortableColumn = 'name' | 'year' | 'rating' | 'addedDate' | 'path';
export type ItemKey = keyof Item;

// Default enabled fields for new categories
export const DEFAULT_ENABLED_FIELDS: Category['enabledFields'] = {
  year: true,
  rating: true,
  genres: true,
  season: false,
  episode: false,
  watched: true,
  path: true,
  description: true,
};
