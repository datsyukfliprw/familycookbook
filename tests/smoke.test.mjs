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

test('diagnose the preserved legacy bundle catalog anchor', async (t) => {
  let source;
  try { source = await readFile(new URL('../dist/assets/index-DN7Jouwl.js', import.meta.url), 'utf8'); }
  catch { t.skip('legacy bundle is not present in this reduced local fixture'); return; }
  const probes = ['ingredientSections', 'smokerDetails', 'coverImage', 'Apple Crisp Snack Mix', 'apple-crisp-snack-mix', 'baked-beans-mom-s-homemade', 'recipe-images/'];
  console.log('LEGACY_DIAGNOSTIC', JSON.stringify(Object.fromEntries(probes.map(probe => [probe, source.indexOf(probe)]))));
  const anchor = probes.map(probe => source.indexOf(probe)).find(index => index >= 0) ?? -1;
  if (anchor >= 0) console.log('LEGACY_SNIPPET', source.slice(Math.max(0, anchor - 1200), Math.min(source.length, anchor + 2400)));
  assert.ok(anchor >= 0, 'legacy bundle should contain a recognizable recipe-schema or recipe-image anchor');
});
