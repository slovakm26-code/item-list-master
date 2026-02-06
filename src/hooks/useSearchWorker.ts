/**
 * Web Worker Hook for Off-Main-Thread Search
 * 
 * Handles filtering/sorting of 1M+ items without blocking UI.
 * Returns filtered results via callback.
 */

import { useEffect, useRef, useState } from 'react';
import { Item, CustomFieldFilter } from '@/types';

interface SearchRequest {
  type: 'search';
  requestId: number;
  items: Item[];
  query: string;
  categoryId: string | null;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  customFieldFilters?: CustomFieldFilter[];
}

interface SearchResponse {
  type: 'searchResult';
  requestId: number;
  results: Item[];
  totalCount: number;
  duration: number;
}

interface UseSearchWorkerOptions {
  items: Item[];
  query: string;
  categoryId: string | null;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  customFieldFilters?: CustomFieldFilter[];
  enabled?: boolean;
}

interface UseSearchWorkerResult {
  results: Item[];
  isSearching: boolean;
  duration: number;
  error: Error | null;
}

// Threshold for using worker (below this, do sync filtering)
const WORKER_THRESHOLD = 10_000;

// Apply custom field filters
function applyCustomFieldFilters(item: Item, filters: CustomFieldFilter[]): boolean {
  return filters.every(filter => {
    const fieldValue = item.customFieldValues?.[filter.fieldId];
    
    switch (filter.operator) {
      case 'equals':
        return fieldValue === filter.value;
      case 'contains':
        return String(fieldValue || '').toLowerCase().includes(String(filter.value).toLowerCase());
      case 'gt':
        return Number(fieldValue) > Number(filter.value);
      case 'lt':
        return Number(fieldValue) < Number(filter.value);
      default:
        return fieldValue === filter.value;
    }
  });
}

// Filter and sort items synchronously
function filterAndSortItems(
  items: Item[],
  query: string,
  categoryId: string | null,
  sortColumn: string | null,
  sortDirection: 'asc' | 'desc',
  customFieldFilters?: CustomFieldFilter[]
): Item[] {
  let filtered = [...items];
  
  // Filter by category
  if (categoryId && categoryId !== 'all') {
    filtered = filtered.filter(item => item.categoryId === categoryId);
  }
  
  // Search query
  if (query && query.trim()) {
    const searchLower = query.toLowerCase().trim();
    const searchTerms = searchLower.split(/\s+/);
    
    filtered = filtered.filter(item => {
      const searchableText = [
        item.name,
        item.description || '',
        item.genres.join(' '),
        item.path,
        String(item.year || ''),
      ].join(' ').toLowerCase();
      
      return searchTerms.every(term => searchableText.includes(term));
    });
  }
  
  // Custom field filters
  if (customFieldFilters && customFieldFilters.length > 0) {
    filtered = filtered.filter(item => applyCustomFieldFilters(item, customFieldFilters));
  }
  
  // Sort
  if (sortColumn) {
    const direction = sortDirection === 'desc' ? -1 : 1;
    
    filtered.sort((a, b) => {
      const aVal = a[sortColumn as keyof Item];
      const bVal = b[sortColumn as keyof Item];
      
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal, 'sk') * direction;
      }
      
      return ((aVal as number) - (bVal as number)) * direction;
    });
  }
  
  return filtered;
}

export function useSearchWorker({
  items,
  query,
  categoryId,
  sortColumn,
  sortDirection,
  customFieldFilters,
  enabled = true,
}: UseSearchWorkerOptions): UseSearchWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [results, setResults] = useState<Item[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  // Initialize worker for large datasets
  useEffect(() => {
    if (!enabled || items.length < WORKER_THRESHOLD) {
      return;
    }

    try {
      // Create worker from blob (inline worker)
      const workerCode = `
        self.onmessage = (event) => {
          const { type, requestId, items, query, categoryId, sortColumn, sortDirection, customFieldFilters } = event.data;
          
          if (type !== 'search') return;
          
          const startTime = performance.now();
          
          let filtered = items;
          
          // Filter by category
          if (categoryId && categoryId !== 'all') {
            filtered = filtered.filter(item => item.categoryId === categoryId);
          }
          
          // Search query
          if (query && query.trim()) {
            const searchLower = query.toLowerCase().trim();
            const searchTerms = searchLower.split(/\\s+/);
            
            filtered = filtered.filter(item => {
              const searchableText = [
                item.name,
                item.description || '',
                item.genres.join(' '),
                item.path,
                String(item.year || ''),
              ].join(' ').toLowerCase();
              
              return searchTerms.every(term => searchableText.includes(term));
            });
          }
          
          // Custom field filters
          if (customFieldFilters && customFieldFilters.length > 0) {
            filtered = filtered.filter(item => {
              return customFieldFilters.every(filter => {
                const fieldValue = item.customFieldValues?.[filter.fieldId];
                
                switch (filter.operator) {
                  case 'equals':
                    return fieldValue === filter.value;
                  case 'contains':
                    return String(fieldValue || '').toLowerCase().includes(String(filter.value).toLowerCase());
                  case 'gt':
                    return Number(fieldValue) > Number(filter.value);
                  case 'lt':
                    return Number(fieldValue) < Number(filter.value);
                  default:
                    return fieldValue === filter.value;
                }
              });
            });
          }
          
          // Sort
          if (sortColumn) {
            const direction = sortDirection === 'desc' ? -1 : 1;
            
            filtered.sort((a, b) => {
              let aVal = a[sortColumn];
              let bVal = b[sortColumn];
              
              if (aVal == null && bVal == null) return 0;
              if (aVal == null) return 1;
              if (bVal == null) return -1;
              
              if (typeof aVal === 'string' && typeof bVal === 'string') {
                return aVal.localeCompare(bVal, 'sk') * direction;
              }
              
              return ((aVal) - (bVal)) * direction;
            });
          }
          
          const duration = performance.now() - startTime;
          
          self.postMessage({
            type: 'searchResult',
            requestId,
            results: filtered,
            totalCount: filtered.length,
            duration,
          });
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      workerRef.current = new Worker(workerUrl);
      
      workerRef.current.onmessage = (event: MessageEvent<SearchResponse>) => {
        const { requestId, results, duration } = event.data;
        
        // Only accept latest request
        if (requestId === requestIdRef.current) {
          setResults(results);
          setDuration(duration);
          setIsSearching(false);
        }
      };

      workerRef.current.onerror = (err) => {
        console.error('Search worker error:', err);
        setError(new Error('Search worker failed'));
        setIsSearching(false);
      };

      return () => {
        workerRef.current?.terminate();
        URL.revokeObjectURL(workerUrl);
      };
    } catch (err) {
      console.error('Failed to create search worker:', err);
      setError(err instanceof Error ? err : new Error('Failed to create worker'));
    }
  }, [enabled, items.length >= WORKER_THRESHOLD]);

  // Perform search
  useEffect(() => {
    if (!enabled) {
      setResults(items);
      return;
    }

    // For small datasets, do synchronous filtering
    if (items.length < WORKER_THRESHOLD) {
      const startTime = performance.now();
      const filtered = filterAndSortItems(items, query, categoryId, sortColumn, sortDirection, customFieldFilters);
      setResults(filtered);
      setDuration(performance.now() - startTime);
      return;
    }

    // For large datasets, use worker
    if (!workerRef.current) {
      setResults(items);
      return;
    }

    requestIdRef.current++;
    setIsSearching(true);

    const request: SearchRequest = {
      type: 'search',
      requestId: requestIdRef.current,
      items,
      query,
      categoryId,
      sortColumn,
      sortDirection,
      customFieldFilters,
    };

    workerRef.current.postMessage(request);
  }, [items, query, categoryId, sortColumn, sortDirection, customFieldFilters, enabled]);

  return { results, isSearching, duration, error };
}
