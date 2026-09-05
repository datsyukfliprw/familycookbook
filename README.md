# Family Cookbook

A source-based, offline-capable family cookbook focused on preserving recipes **and the stories behind them**.

## What the current app adds

- Family Cookbook 2.0 home with search, Cook Again, Family Favorites, Recently Added, and Collections
- A dedicated **Jay's Pit House** experience for smoking/BBQ recipes with its own dark visual system and smoker-first browsing
- Ingredients-first family recipe pages: hero + quick facts, then ingredients immediately, followed by directions, story, notes, and revision history
- Full-screen Cook Mode with persisted step progress, keyboard navigation, detected step timers, and smoker pit checks
- First-class smoker profiles (pit temperature, wood, smoke target, pull temperature, time, finish, and rest)
- `.fcp` v1/v2 preview, validation, warnings, and duplicate-aware import
- Simple create/edit flow using natural ingredient/direction text and `[Section]` headings
- Multi-membership collections and broad local search (including phrases such as `smoker under 60 min`)
- Grocery list generation from recipes
- Offline PWA shell and runtime recipe-image caching
- Automatic migration of recipes previously stored under `family-cookbook:user-recipes:v1`
- One-time conversion of the original built-in recipe catalog from the preserved legacy bundle into the new structured recipe model; smoker recipes are filed into Jay's Pit House

The original compiled application is still preserved under `/legacy/` as a safety copy. On first load, its built-in recipe catalog is converted into the modern structured cookbook and persisted locally, so the old catalog no longer needs to be used as the everyday recipe UI.

## Architecture

The application is intentionally dependency-light. It is written in strict TypeScript and uses browser platform APIs rather than patching a pre-rendered React bundle.

```text
src/
  app.ts        routing + UI + interactions
  data.ts       native seed recipes
  fcp.ts        package validation/import mapping
  grocery.ts    grocery-list normalization
  legacy-catalog.ts one-time built-in catalog conversion
  search.ts     cookbook search
  storage.ts    versioned persistence + v1 migration
  types.ts      unified recipe model
  styles.css    responsive heirloom cookbook design
  themes.css    Family Cookbook + Jay's Pit House visual systems
public/
  manifest.webmanifest
  sw.js
scripts/
  build.mjs
```

`dist/` remains the deployable directory. The build only replaces `dist/v2`, `dist/index.html`, the manifest, and the service worker; existing `recipe-images`, `.fcp` packages, and legacy assets are preserved.

## Development

Requirements: Node 20+ and npm.

```bash
npm install
npm run check
npm test
npm run build
```

Serve `dist/` with any static server. The existing `nginx.conf` remains compatible because navigation uses hash routes.

## Family Cookbook Packages (.fcp)

The importer accepts Family Cookbook Package versions 1 and 2, validates before writing, caps packages at 10 MB / 100 recipes, previews warnings, and detects matching recipe titles before import.

A complete v2 smoker example is included at:

`dist/packages/smoked-greek-lemon-chicken-bowls.fcp`

Its bundled hero image is:

`dist/recipe-images/smoked-greek-lemon-chicken-bowls.webp`

## Persistence

This remains a static/private-first application. Recipes, cook progress, timers, notes, and grocery state are stored in the browser. A server-side database/auth/sync layer can replace the storage module later without changing the recipe model or UI flows.
