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

test('old built-in catalog has a one-time structured migration path', async () => {
  const migration = await readFile(new URL('../src/legacy-catalog.ts', import.meta.url), 'utf8');
  assert.match(migration, /smoked-chicken-thighs-crispy-skin/);
  assert.match(migration, /family-cookbook:bundled-catalog:v1/);
  assert.match(migration, /ingredientSections/);
  assert.match(migration, /directionSections/);
  assert.match(migration, /Jay's Pit House/);
});

test('build preserves legacy assets instead of deleting dist', async () => {
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(build, /rm\(['"]dist['"]/);
  assert.match(build, /dist\/v2/);
});

test('PWA service worker caches app shell, migration source, and recipe images', async () => {
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /recipe-images/);
  assert.match(sw, /index-DN7Jouwl\.js/);
  assert.match(sw, /legacy-catalog\.js/);
  assert.match(sw, /themes\.css/);
  assert.match(sw, /caches\.open/);
});

test('the preserved legacy bundle still contains an extractable full recipe catalog', async (t) => {
  let source;
  try { source = await readFile(new URL('../dist/assets/index-DN7Jouwl.js', import.meta.url), 'utf8'); }
  catch { t.skip('legacy bundle is not present in this reduced local fixture'); return; }
  const marker = '{id:"smoked-chicken-thighs-crispy-skin",title:"Smoked Chicken Thighs (Crispy Skin)"';
  const markerIndex = source.indexOf(marker);
  assert.ok(markerIndex > 0, 'first legacy recipe marker should exist');
  const start = source.lastIndexOf('[', markerIndex);
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
  assert.ok(catalog.length > 30, `expected a full catalog, got ${catalog.length}`);
  assert.ok(catalog.some(recipe => recipe.title === 'Apple Crisp Snack Mix'));
  assert.ok(catalog.some(recipe => recipe.smokerDetails));
});
