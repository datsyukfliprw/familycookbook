import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist/v2', { recursive: true, force: true });
await mkdir('dist/v2', { recursive: true });
await cp('.build', 'dist/v2', { recursive: true });
await cp('src/styles.css', 'dist/v2/styles.css');
await cp('src/index.html', 'dist/index.html');
await cp('public/manifest.webmanifest', 'dist/manifest.webmanifest');
await cp('public/sw.js', 'dist/sw.js');
console.log('Built Family Cookbook v2 into dist/ while preserving recipe-images, packages, and legacy assets.');
