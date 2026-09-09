import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('source app exposes the primary product flows', async () => {
  const app = await readFile(new URL('../src/app.ts', import.meta.url), 'utf8');
  for (const expected of ['Start cooking', 'Import a Family Cookbook Package', 'Grocery list', 'Collections', 'Family notes', "Jay’s Pit House", 'ingredients-first']) assert.match(app, new RegExp(expected, 'i'));
});

test('family recipe detail renders ingredients before directions and story', async () => {
  const app = await readFile(new URL('../src/app.ts', import.meta.url), 'utf8');
  const detail = app.slice(app.indexOf('const recipeDetail ='), app.indexOf('const collectionsPage ='));
  assert.ok(detail.indexOf('ingredients-first') > 0);
  assert.ok(detail.indexOf('directions-block') > detail.indexOf('ingredients-first'));
  assert.ok(detail.indexOf('lower-story') > detail.indexOf('directions-block'));
});

test('old built-in catalog has a one-time structured migration path for the real schema', async () => {
  const migration = await readFile(new URL('../src/legacy-catalog.ts', import.meta.url), 'utf8');
  for (const expected of ['family-cookbook:bundled-catalog:v2', 'legacy.ingredients', 'legacy.directions', 'legacy.image', 'legacy.meta', "Jay's Pit House", 'LegacyLiteralParser', 'saveState']) assert.match(migration, new RegExp(expected.replace('.', '\\.')));
  assert.doesNotMatch(migration, /\bFunction\s*\(|\beval\s*\(/, 'migration must work when CSP blocks dynamic code evaluation');
});

test('build preserves legacy assets instead of deleting dist', async () => {
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(build, /rm\(['"]dist['"]/);
  assert.match(build, /dist\/v2/);
  assert.match(build, /recipe-images\/manifest\.json/);
  assert.match(build, /themes\.css/);
  assert.match(build, /accept="\.fcp,application\/json"/);
});

test('PWA service worker caches app shell, migration source, and recipe images', async () => {
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /recipe-images/);
  assert.match(sw, /index-DN7Jouwl\.js/);
  assert.match(sw, /legacy-catalog\.js/);
  assert.match(sw, /themes\.css/);
  assert.match(sw, /caches\.open/);
});

test('the real legacy catalog migrates, persists, has valid images, and is searchable in v2 without eval', async () => {
  const source = await readFile(new URL('../dist/assets/index-DN7Jouwl.js', import.meta.url), 'utf8');
  const imageManifest = JSON.parse(await readFile(new URL('../dist/recipe-images/manifest.json', import.meta.url), 'utf8'));
  const [{ migrateBundledLegacyCatalog, parseLegacyCatalog }, { seedRecipes }, { searchRecipes }] = await Promise.all([
    import('../dist/v2/legacy-catalog.js'),
    import('../dist/v2/data.js'),
    import('../dist/v2/search.js')
  ]);

  const catalog = parseLegacyCatalog(source);
  assert.equal(catalog.length, 331, 'the parser should recover every entry from the preserved bundle');

  class MemoryStorage {
    values = new Map();
    failKey = '';
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) {
      if (key === this.failKey) throw new Error('simulated storage quota failure');
      this.values.set(key, String(value));
    }
    removeItem(key) { this.values.delete(key); }
  }
  const storage = new MemoryStorage();
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const originalFunction = globalThis.Function;
  storage.setItem('family-cookbook:bundled-catalog:v1', 'done');
  globalThis.localStorage = storage;
  globalThis.fetch = async url => {
    if (String(url) === '/assets/index-DN7Jouwl.js') return { ok: true, status: 200, text: async () => source };
    if (String(url) === '/recipe-images/manifest.json') return { ok: true, status: 200, json: async () => imageManifest };
    return { ok: false, status: 404 };
  };
  globalThis.Function = () => { throw new Error('unsafe-eval is blocked by Content Security Policy'); };

  try {
    const state = { version: 2, recipes: structuredClone(seedRecipes), grocery: [] };
    const added = await migrateBundledLegacyCatalog(state);
    assert.equal(added, 331);
    assert.equal(state.recipes.length, 332);
    assert.equal(storage.getItem('family-cookbook:bundled-catalog:v2'), 'done');

    const persisted = JSON.parse(storage.getItem('family-cookbook:v2'));
    assert.equal(persisted.recipes.length, state.recipes.length, 'the full catalog must be saved before migration is marked done');
    assert.equal(searchRecipes(persisted.recipes, 'Apple Crisp Snack Mix')[0]?.title, 'Apple Crisp Snack Mix', 'a migrated recipe should be visible through v2 search');

    const available = new Set(imageManifest);
    const migratedWithImages = persisted.recipes.filter(recipe => recipe.history?.some(entry => entry.summary.includes('original Family Cookbook')) && recipe.image);
    assert.ok(migratedWithImages.length > 60, 'available legacy images should be retained');
    assert.ok(migratedWithImages.every(recipe => available.has(recipe.image)), 'migrated recipes must not point at missing image files');
    assert.equal(persisted.recipes.find(recipe => recipe.id === 'baked-beans-mom-s-homemade')?.image, '/recipe-images/4/baked-beans-mom-s-homemade.webp');
    assert.equal(await migrateBundledLegacyCatalog(state), 0, 'completed migration should remain idempotent');

    storage.removeItem('family-cookbook:bundled-catalog:v2');
    state.recipes.find(recipe => recipe.id === 'baked-beans-mom-s-homemade').image = '/recipe-images/baked-beans-mom-s-homemade.webp';
    assert.equal(await migrateBundledLegacyCatalog(state), 0, 'repairing an existing migrated record should not duplicate it');
    assert.equal(state.recipes.find(recipe => recipe.id === 'baked-beans-mom-s-homemade')?.image, '/recipe-images/4/baked-beans-mom-s-homemade.webp');

    const failingStorage = new MemoryStorage();
    failingStorage.failKey = 'family-cookbook:v2';
    globalThis.localStorage = failingStorage;
    const retryState = { version: 2, recipes: structuredClone(seedRecipes), grocery: [] };
    await assert.rejects(migrateBundledLegacyCatalog(retryState), /simulated storage quota failure/);
    assert.equal(failingStorage.getItem('family-cookbook:bundled-catalog:v2'), null, 'a failed state write must not mark migration complete');
    assert.equal(retryState.recipes.length, 1, 'a failed state write must leave the in-memory state unchanged');
    failingStorage.failKey = '';
    assert.equal(await migrateBundledLegacyCatalog(retryState), 331, 'migration should retry cleanly after persistence recovers');
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.fetch = originalFetch;
    globalThis.Function = originalFunction;
  }
});
