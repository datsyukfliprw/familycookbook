import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('source app exposes the primary product flows', async () => {
  const app = await readFile(new URL('../src/app.ts', import.meta.url), 'utf8');
  for (const expected of ['Start cooking', 'Import a Family Cookbook Package', 'Grocery list', 'Collections', 'legacy cookbook', 'Family notes']) assert.match(app, new RegExp(expected, 'i'));
});

test('build preserves legacy assets instead of deleting dist', async () => {
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(build, /rm\(['"]dist['"]/);
  assert.match(build, /dist\/v2/);
});

test('PWA service worker caches app shell and recipe images', async () => {
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /recipe-images/);
  assert.match(sw, /caches\.open/);
});
