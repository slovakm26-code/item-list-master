export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  orderIndex: number;
  icon?: string;
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
}

export type SortableColumn = 'name' | 'year' | 'rating' | 'addedDate' | 'path';
export type ItemKey = keyof Item;
