# Family Cookbook

A source-based, offline-friendly family cookbook for preserving recipes **and the people and stories behind them**.

The production site is served from `dist/`. Family Cookbook v2 has a real TypeScript source tree under `src/`; `npm run build` compiles that source into `dist/v2` without deleting recipe images, `.fcp` packages, or the preserved legacy app.

## What the current app adds

- **Family Cookbook 2.0** with a warm, family-oriented visual system, search, **Cook Again**, **Family Favorites**, collections, and recently added recipes
- A dedicated **Jay's Pit House** experience for smoking/BBQ recipes with its own dark ember/charcoal visual system and smoker-focused browsing
- Ingredients-first recipe pages: hero photography and quick facts first, then **ingredients immediately**, followed by directions, story, notes, and history
- Full-screen **Cook Mode** with one-step-at-a-time directions, keyboard navigation, ingredient context, smoker pit checks, timers, and persisted resume state
- A dedicated **Smoke Profile** for pit temperature, wood blend, smoke target, pull temperature, cook window, finishing method, and rest time
- First-class `.fcp` import with drag/drop, validation, preview, warnings, and duplicate detection
- Manual create/edit recipe flow with section-aware ingredient and direction entry plus advanced smoker fields
- Family notes and lightweight recipe history
- Multi-membership collections instead of a single rigid category system
- Search across titles, ingredients, people, categories, tags, collections, and smoker metadata, including simple phrases such as `under 30 min`
- Grocery-list generation from recipes
- PWA/offline caching for the app shell, migration source, theme assets, and recipe images
- Automatic migration of recipes stored by the previous `family-cookbook:user-recipes:v1` browser format
- A one-time structured conversion of the original built-in recipe catalog from the preserved legacy bundle; smoker recipes are automatically filed into **Jay's Pit House**

## Architecture

```text
src/
  app.ts             application/router and UI flows
  types.ts           unified recipe domain model
  data.ts            packaged seed recipe data
  storage.ts         versioned persistence + v1 migration
  legacy-catalog.ts  one-time original catalog conversion
  fcp.ts             Family Cookbook Package validation/import
  search.ts          local recipe search
  grocery.ts         grocery-list generation
  styles.css         responsive base visual system
  themes.css         Family Cookbook + Jay's Pit House themes

public/
  manifest.webmanifest
  sw.js

scripts/
  build.mjs          non-destructive static production build

tests/
  smoke.test.mjs
```

The app intentionally keeps persistence behind a small storage boundary. Today it uses local storage so the current static/nginx deployment remains simple; a real API/database can replace that layer later without rebuilding the recipe UI.

## Family Cookbook Packages (`.fcp`)

The importer supports package versions **1 and 2** and validates package structure before writing anything. Imported recipes are previewed first. Matching recipe titles are updated rather than duplicated.

The picker intentionally remains unrestricted after opening because iOS Files can grey out custom `.fcp` extensions when an HTML `accept` filter is present. Package format and version are validated after the file is selected.

The existing smoker package remains at:

`dist/packages/smoked-greek-lemon-chicken-bowls.fcp`

and is represented natively in the v2 data model with its full smoker profile and structured sections.

## Preserving and converting the previous cookbook

The previous compiled application and all of its existing assets remain intact. Its entry point is still available at:

`/legacy/index.html`

The legacy copy is now a safety net rather than the everyday catalog. On first load, the current app reads the trusted built-in recipe array from the preserved legacy bundle, converts those recipes into the modern structured model, skips duplicates, files smoking/BBQ recipes into Jay's Pit House, and persists the result locally. The migration marker is written only after a successful conversion, so a failed load can retry later.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

`npm run build` writes the production modules and theme assets to `dist/v2`, updates the v2 entry point/PWA files, and **does not remove** `dist/assets`, `dist/recipe-images`, `dist/packages`, or `dist/legacy`.

The build also preserves the iOS-friendly unrestricted `.fcp` picker behavior. CI runs TypeScript checking, smoke tests (including validation against the real preserved legacy catalog), and a production build for every pull request.
