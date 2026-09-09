import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { posix } from 'node:path';

const listFiles = async (directory, relative = '') => {
  const entries = await readdir(posix.join(directory, relative), { withFileTypes: true });
  const paths = await Promise.all(entries.map(entry => {
    const child = posix.join(relative, entry.name);
    return entry.isDirectory() ? listFiles(directory, child) : [child];
  }));
  return paths.flat();
};

await rm('dist/v2', { recursive: true, force: true });
await mkdir('dist/v2', { recursive: true });
await cp('.build', 'dist/v2', { recursive: true });
await cp('src/styles.css', 'dist/v2/styles.css');
await cp('src/themes.css', 'dist/v2/themes.css');
await cp('src/index.html', 'dist/index.html');
await cp('public/manifest.webmanifest', 'dist/manifest.webmanifest');
await cp('public/sw.js', 'dist/sw.js');

const recipeImages = (await listFiles('dist/recipe-images'))
  .filter(path => path !== '.gitkeep' && path !== 'manifest.json')
  .map(path => `/recipe-images/${path}`)
  .sort();
await writeFile('dist/recipe-images/manifest.json', `${JSON.stringify(recipeImages, null, 2)}\n`);

// iOS Files can grey out custom .fcp extensions when an accept filter is present.
// Keep validation in the importer, but leave the system picker unrestricted.
const appPath = 'dist/v2/app.js';
const compiledApp = await readFile(appPath, 'utf8');
await writeFile(appPath, compiledApp.replace(' accept=".fcp,application/json"', ''));

console.log('Built Family Cookbook v2 into dist/ while preserving recipe-images, packages, and legacy assets.');
