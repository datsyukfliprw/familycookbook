# familycookbook

Our Family Cookbook — a static cookbook site with locally saved recipe additions.

The site is served from `dist/`. Recipe additions are saved in the browser using local storage because this deployment does not include a server-side database or upload API.

## Family Cookbook Packages (.fcp)

The cookbook supports Family Cookbook Packages (`.fcp`) as JSON. The importer accepts both **v1** and **v2** packages.

### v2 recipe fields

Alongside the original `title`, `category`, `ingredients`, `directions`, `note`, `image`, and `meta` fields, v2 can carry richer recipe data:

- `ingredientSections`: named groups such as Chicken, Tzatziki, Rice, or Sauce
- `directionSections`: named cooking stages with grouped steps
- `smoker`: pit temperature, wood blend, smoke target, pull temperature, cook window, and finishing method
- `pitNotes`: smoker-specific notes shown in a dedicated card
- `image`: either an embedded data image or a site-local `/recipe-images/...` path
- `meta.marinate` and `meta.cookLabel`: human-readable timing for ranges such as `2–8 hr` and `45–75 min`

The importer validates packages before saving them. If an imported recipe has the same title and category as a recipe already on the device, it updates that recipe in place instead of creating a duplicate.

The file picker intentionally does not use an HTML `accept` restriction because iOS Files greys out custom `.fcp` extensions when that filter is present. Package type and version are validated after selection.

A v2 sample is included at:

`dist/packages/smoked-greek-lemon-chicken-bowls.fcp`

The sample uses the smoker-specific recipe layout and bundled hero image at:

`dist/recipe-images/smoked-greek-lemon-chicken-bowls.webp`

## Recipe detail experience

User-added recipe detail pages are enhanced on top of the existing static build. The enhanced renderer adds:

- compact mobile title treatment and a 4:3 hero image
- timing chips and jump navigation
- a dedicated smoker setup card for Smoking & BBQ recipes
- real ingredient sections with tap-to-check ingredients
- grouped/collapsible direction stages
- a dedicated Pit Notes card
- removal of the floating My Recipes / Add Recipe / Import controls while reading a recipe
- compatibility heuristics that make older v1 imported recipes display in sections when their flat lists contain uppercase section labels or `SECTION — step` prefixes

The current build still stores imported and manually added recipes in browser-local storage. A server-side database/API is the next architectural step if recipes need to sync across devices.
