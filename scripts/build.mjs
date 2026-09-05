import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist/v2', { recursive: true, force: true });
await mkdir('dist/v2', { recursive: true });
await cp('.build', 'dist/v2', { recursive: true });
await cp('src/styles.css', 'dist/v2/styles.css');
await cp('src/themes.css', 'dist/v2/themes.css');
await cp('src/index.html', 'dist/index.html');
await cp('public/manifest.webmanifest', 'dist/manifest.webmanifest');
await cp('public/sw.js', 'dist/sw.js');

// iOS Files can grey out custom .fcp extensions when an accept filter is present.
// Keep validation in the importer, but leave the system picker unrestricted.
const appPath = 'dist/v2/app.js';
const compiledApp = await readFile(appPath, 'utf8');
await writeFile(appPath, compiledApp.replace(' accept=".fcp,application/json"', ''));

console.log('Built Family Cookbook v2 into dist/ while preserving recipe-images, packages, and legacy assets.');
