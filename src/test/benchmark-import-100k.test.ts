/**
 * Benchmark Test: Import 100,000 Items
 * 
 * Tests the performance of the JSONStorageAdapter when importing
 * a large dataset. Measures generation, import, query, search,
 * and deletion times.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSONStorageAdapter } from '@/lib/storage/JSONStorageAdapter';
import { Item, Category } from '@/types';
import { ExportData } from '@/lib/storage/StorageAdapter';

const ITEM_COUNT = 100_000;

// --- Helpers ---

function generateCategory(id: string, name: string): Category {
  return {
    id,
    name,
    parentId: null,
    orderIndex: 0,
    enabledFields: { year: true, rating: true, genres: true, watched: true, description: true, path: true },
  };
}

function generateItems(count: number, categoryIds: string[]): Item[] {
  const items: Item[] = new Array(count);
  const genres = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Thriller', 'Romance', 'Documentary'];

  for (let i = 0; i < count; i++) {
    items[i] = {
      id: `item-${i}`,
      name: `Test Item ${i} - ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(97 + ((i * 7) % 26))}`,
      year: 1980 + (i % 45),
      rating: (i % 10) + 1,
      genres: [genres[i % genres.length], genres[(i + 3) % genres.length]],
      description: `Description for item ${i}. This is a test entry with some searchable content. Keywords: alpha-${i % 100} beta-${i % 50}.`,
      categoryId: categoryIds[i % categoryIds.length],
      path: `/media/collection/item-${i}`,
      addedDate: new Date(2020, 0, 1 + (i % 1500)).toISOString(),
      coverPath: '',
      orderIndex: i,
      season: i % 5 === 0 ? Math.floor(i / 1000) + 1 : null,
      episode: i % 5 === 0 ? (i % 24) + 1 : null,
      watched: i % 3 === 0,
    };
  }
  return items;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatMemory(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

// --- Test Suite ---

describe(`Benchmark: Import ${ITEM_COUNT.toLocaleString()} items`, () => {
  let adapter: JSONStorageAdapter;
  let testCategories: Category[];
  let testItems: Item[];

  beforeEach(async () => {
    // Use a unique DB name to avoid conflicts
    adapter = new JSONStorageAdapter();
    await adapter.init();
  });

  afterEach(async () => {
    // Cleanup - delete all items
    try {
      const state = await adapter.loadState();
      if (state && state.items.length > 0) {
        await adapter.saveState({
          ...state,
          categories: [],
          items: [],
        });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  it(`should generate ${ITEM_COUNT.toLocaleString()} items quickly`, () => {
    const categoryIds = ['cat-movies', 'cat-series', 'cat-games', 'cat-books', 'cat-music'];
    testCategories = categoryIds.map((id, i) => generateCategory(id, `Category ${i + 1}`));

    const start = performance.now();
    testItems = generateItems(ITEM_COUNT, categoryIds);
    const elapsed = performance.now() - start;

    console.log(`\n📦 Generation: ${ITEM_COUNT.toLocaleString()} items in ${formatTime(elapsed)}`);
    console.log(`   Memory per item: ~${((JSON.stringify(testItems[0]).length))}B JSON`);

    expect(testItems).toHaveLength(ITEM_COUNT);
    expect(elapsed).toBeLessThan(10_000); // Must complete under 10s
  });

  it(`should import ${ITEM_COUNT.toLocaleString()} items via importData`, async () => {
    const categoryIds = ['cat-movies', 'cat-series', 'cat-games', 'cat-books', 'cat-music'];
    testCategories = categoryIds.map((id, i) => generateCategory(id, `Category ${i + 1}`));
    testItems = generateItems(ITEM_COUNT, categoryIds);

    const exportData: ExportData = {
      version: 3,
      exportDate: new Date().toISOString(),
      categories: testCategories,
      items: testItems,
    };

    let progressCalls = 0;
    const onProgress = (count: number) => {
      progressCalls++;
    };

    const startImport = performance.now();
    await adapter.importData(exportData, onProgress);
    const importTime = performance.now() - startImport;

    console.log(`\n📥 Import: ${ITEM_COUNT.toLocaleString()} items in ${formatTime(importTime)}`);
    console.log(`   Throughput: ${Math.round(ITEM_COUNT / (importTime / 1000)).toLocaleString()} items/sec`);
    console.log(`   Progress callbacks: ${progressCalls}`);

    // Verify count
    const count = await adapter.getItemCount();
    expect(count).toBe(ITEM_COUNT);
    expect(importTime).toBeLessThan(30_000); // Must complete under 30s
  }, 60_000);

  it(`should batch-add ${ITEM_COUNT.toLocaleString()} items via addItems`, async () => {
    const categoryIds = ['cat-movies', 'cat-series', 'cat-games', 'cat-books', 'cat-music'];
    testCategories = categoryIds.map((id, i) => generateCategory(id, `Category ${i + 1}`));
    testItems = generateItems(ITEM_COUNT, categoryIds);

    // Setup categories first
    for (const cat of testCategories) {
      await adapter.addCategory(cat);
    }

    let lastProgress = 0;
    const onProgress = (count: number) => { lastProgress = count; };

    const start = performance.now();
    await adapter.addItems!(testItems, onProgress);
    const elapsed = performance.now() - start;

    console.log(`\n📥 Batch addItems: ${ITEM_COUNT.toLocaleString()} items in ${formatTime(elapsed)}`);
    console.log(`   Throughput: ${Math.round(ITEM_COUNT / (elapsed / 1000)).toLocaleString()} items/sec`);
    console.log(`   Last progress: ${lastProgress.toLocaleString()}`);

    const count = await adapter.getItemCount();
    expect(count).toBe(ITEM_COUNT);
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);

  it('should query items by category efficiently after import', async () => {
    const categoryIds = ['cat-movies', 'cat-series', 'cat-games', 'cat-books', 'cat-music'];
    testCategories = categoryIds.map((id, i) => generateCategory(id, `Category ${i + 1}`));
    testItems = generateItems(ITEM_COUNT, categoryIds);

    await adapter.importData({
      version: 3,
      exportDate: new Date().toISOString(),
      categories: testCategories,
      items: testItems,
    });

    // Query by category
    const startQuery = performance.now();
    const categoryItems = await adapter.getItems({ categoryId: 'cat-movies' });
    const queryTime = performance.now() - startQuery;

    console.log(`\n🔍 Category query: ${categoryItems.length.toLocaleString()} results in ${formatTime(queryTime)}`);

    expect(categoryItems.length).toBe(ITEM_COUNT / 5); // 5 categories, even distribution
    expect(queryTime).toBeLessThan(5_000);
  }, 60_000);

  it('should search items by text efficiently after import', async () => {
    const categoryIds = ['cat-movies', 'cat-series', 'cat-games'];
    testCategories = categoryIds.map((id, i) => generateCategory(id, `Category ${i + 1}`));
    testItems = generateItems(ITEM_COUNT, categoryIds);

    await adapter.importData({
      version: 3,
      exportDate: new Date().toISOString(),
      categories: testCategories,
      items: testItems,
    });

    // Search by name substring
    const startSearch = performance.now();
    const searchResults = await adapter.searchItems('alpha-42');
    const searchTime = performance.now() - startSearch;

    console.log(`\n🔎 Text search "alpha-42": ${searchResults.length.toLocaleString()} results in ${formatTime(searchTime)}`);

    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchTime).toBeLessThan(5_000);

    // Search with category filter
    const startFiltered = performance.now();
    const filteredResults = await adapter.searchItems('beta-10', 'cat-movies');
    const filteredTime = performance.now() - startFiltered;

    console.log(`🔎 Filtered search "beta-10" in cat-movies: ${filteredResults.length.toLocaleString()} results in ${formatTime(filteredTime)}`);
    expect(filteredTime).toBeLessThan(5_000);
  }, 60_000);

  it('should sort items efficiently after import', async () => {
    const categoryIds = ['cat-movies', 'cat-series'];
    testCategories = categoryIds.map((id, i) => generateCategory(id, `Category ${i + 1}`));
    testItems = generateItems(ITEM_COUNT, categoryIds);

    await adapter.importData({
      version: 3,
      exportDate: new Date().toISOString(),
      categories: testCategories,
      items: testItems,
    });

    // Sort by rating desc
    const startSort = performance.now();
    const sorted = await adapter.getItems({
      sortColumn: 'rating',
      sortDirection: 'desc',
      limit: 100,
    });
    const sortTime = performance.now() - startSort;

    console.log(`\n📊 Sort by rating (desc, top 100): ${formatTime(sortTime)}`);

    expect(sorted.length).toBe(100);
    expect(sorted[0].rating).toBeGreaterThanOrEqual(sorted[99].rating!);
    expect(sortTime).toBeLessThan(5_000);

    // Sort by name asc
    const startNameSort = performance.now();
    const nameSorted = await adapter.getItems({
      sortColumn: 'name',
      sortDirection: 'asc',
      limit: 50,
    });
    const nameSortTime = performance.now() - startNameSort;

    console.log(`📊 Sort by name (asc, top 50): ${formatTime(nameSortTime)}`);
    expect(nameSorted.length).toBe(50);
    expect(nameSortTime).toBeLessThan(5_000);
  }, 60_000);

  it('should handle single item CRUD after large import', async () => {
    const categoryIds = ['cat-movies'];
    testCategories = categoryIds.map((id, i) => generateCategory(id, `Category ${i + 1}`));
    testItems = generateItems(ITEM_COUNT, categoryIds);

    await adapter.importData({
      version: 3,
      exportDate: new Date().toISOString(),
      categories: testCategories,
      items: testItems,
    });

    // Read single item
    const startRead = performance.now();
    const item = await adapter.getItemById('item-50000');
    const readTime = performance.now() - startRead;
    console.log(`\n📖 Read single item: ${formatTime(readTime)}`);
    expect(item).not.toBeNull();
    expect(item!.id).toBe('item-50000');

    // Update single item
    const startUpdate = performance.now();
    await adapter.updateItem('item-50000', { name: 'Updated Item 50000', rating: 10 });
    const updateTime = performance.now() - startUpdate;
    console.log(`✏️  Update single item: ${formatTime(updateTime)}`);

    const updated = await adapter.getItemById('item-50000');
    expect(updated!.name).toBe('Updated Item 50000');
    expect(updated!.rating).toBe(10);

    // Delete single item
    const startDelete = performance.now();
    await adapter.deleteItems(['item-50000']);
    const deleteTime = performance.now() - startDelete;
    console.log(`🗑️  Delete single item: ${formatTime(deleteTime)}`);

    const count = await adapter.getItemCount();
    expect(count).toBe(ITEM_COUNT - 1);

    const deleted = await adapter.getItemById('item-50000');
    expect(deleted).toBeNull();
  }, 60_000);

  it('should export all data after large import', async () => {
    const categoryIds = ['cat-movies', 'cat-series'];
    testCategories = categoryIds.map((id, i) => generateCategory(id, `Category ${i + 1}`));
    testItems = generateItems(ITEM_COUNT, categoryIds);

    await adapter.importData({
      version: 3,
      exportDate: new Date().toISOString(),
      categories: testCategories,
      items: testItems,
    });

    const startExport = performance.now();
    const exportData = await adapter.exportData();
    const exportTime = performance.now() - startExport;

    console.log(`\n📤 Export: ${exportData.items.length.toLocaleString()} items in ${formatTime(exportTime)}`);
    console.log(`   Categories: ${exportData.categories.length}`);

    expect(exportData.items).toHaveLength(ITEM_COUNT);
    expect(exportData.categories).toHaveLength(2);
    expect(exportTime).toBeLessThan(5_000);
  }, 60_000);

  it('should report storage info accurately', async () => {
    const categoryIds = ['cat-movies'];
    testCategories = categoryIds.map((id, i) => generateCategory(id, `Category ${i + 1}`));
    testItems = generateItems(ITEM_COUNT, categoryIds);

    await adapter.importData({
      version: 3,
      exportDate: new Date().toISOString(),
      categories: testCategories,
      items: testItems,
    });

    const startInfo = performance.now();
    const info = await adapter.getStorageInfo();
    const infoTime = performance.now() - startInfo;

    console.log(`\n💾 Storage Info in ${formatTime(infoTime)}:`);
    console.log(`   Type: ${info.type}`);
    console.log(`   Used: ${formatMemory(info.usedBytes)}`);
    console.log(`   Items: ${info.itemCount.toLocaleString()}`);
    console.log(`   Large datasets: ${info.supportsLargeDatasets}`);

    expect(info.itemCount).toBe(ITEM_COUNT);
    expect(info.usedBytes).toBeGreaterThan(0);
  }, 60_000);
});
