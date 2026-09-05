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
  for (const expected of ['family-cookbook:bundled-catalog:v1', 'legacy.ingredients', 'legacy.directions', 'legacy.image', 'legacy.meta', "Jay's Pit House"]) assert.match(migration, new RegExp(expected.replace('.', '\\.')));
});

test('build preserves legacy assets instead of deleting dist', async () => {
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(build, /rm\(['"]dist['"]/);
  assert.match(build, /dist\/v2/);
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

test('the preserved legacy bundle contains the extractable original recipe catalog', async (t) => {
  let source;
  try { source = await readFile(new URL('../dist/assets/index-DN7Jouwl.js', import.meta.url), 'utf8'); }
  catch { t.skip('legacy bundle is not present in this reduced local fixture'); return; }
  const startPattern = /\[\{id:(["'`])[^"'`]+\1,title:(["'`])[^"'`]+\2,category:(["'`])[^"'`]+\3,order:\d+,intro:\[/;
  const match = startPattern.exec(source);
  assert.ok(match && match.index >= 0, 'original catalog array should have the expected recipe-object shape');
  const start = match.index;
  let depth = 0, quote = '', escaped = false, end = -1;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '[') depth += 1;
    else if (char === ']' && --depth === 0) { end = i + 1; break; }
  }
  assert.ok(end > start, 'catalog array should have a balanced end');
  const catalog = Function(`"use strict";return (${source.slice(start, end)});`)();
  assert.ok(Array.isArray(catalog));
  assert.ok(catalog.length > 30, `expected the full original catalog, got ${catalog.length}`);
  assert.ok(catalog.some(recipe => recipe.title === 'Apple Crisp Snack Mix'));
  assert.ok(catalog.filter(recipe => Array.isArray(recipe.ingredients) && Array.isArray(recipe.directions)).length >= Math.floor(catalog.length * 0.8));
  assert.ok(catalog.some(recipe => String(recipe.image || '').startsWith('/recipe-images/')));
});
