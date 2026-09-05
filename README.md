# Family Cookbook

A source-based, offline-friendly family cookbook for preserving recipes **and the people and stories behind them**.

The production site is served from `dist/`. Family Cookbook v2 now has a real TypeScript source tree under `src/`; `npm run build` compiles that source into `dist/v2` without deleting recipe images, `.fcp` packages, or the preserved legacy app.

## What v2 adds

- A redesigned home experience with search, **Cook Again**, **Family Favorites**, collections, and recently added recipes
- Rich recipe pages with hero photography, family attribution, recipe stories, timing/yield metadata, ingredient checkoffs, and serving controls
- Full-screen **Cook Mode** with one-step-at-a-time directions, keyboard navigation, ingredient context, smoker pit checks, timers, and persisted resume state
- A dedicated **Smoke Profile** for pit temperature, wood blend, smoke target, pull temperature, cook window, finishing method, and rest time
- First-class `.fcp` import with drag/drop, validation, preview, warnings, and duplicate detection
- Manual create/edit recipe flow with section-aware ingredient and direction entry plus advanced smoker fields
- Family notes and lightweight recipe history
- Multi-membership collections instead of a single rigid category system
- Search across titles, ingredients, people, categories, tags, collections, and smoker metadata, including simple phrases such as `under 30 min`
- Grocery-list generation from recipes
- PWA/offline caching for the app shell and recipe images
- Automatic migration of recipes stored by the previous `family-cookbook:user-recipes:v1` browser format

## Architecture

```text
src/
  app.ts       application/router and UI flows
  types.ts     unified recipe domain model
  data.ts      packaged seed recipe data
  storage.ts   versioned persistence + v1 migration
  fcp.ts       Family Cookbook Package validation/import
  search.ts    local recipe search
  grocery.ts   grocery-list generation
  styles.css   responsive visual system

public/
  manifest.webmanifest
  sw.js

scripts/
  build.mjs    non-destructive static production build

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

## Preserving the previous cookbook

The previous compiled application and all of its existing assets remain intact. Its entry point is available at:

`/legacy/index.html`

This gives the migration a safety net: the new app becomes the default experience without deleting the old cookbook or its images/packages.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

`npm run build` writes the production modules to `dist/v2`, updates the v2 entry point/PWA files, and **does not remove** `dist/assets`, `dist/recipe-images`, `dist/packages`, or `dist/legacy`.

CI runs TypeScript checking, smoke tests, and a production build for every pull request.
