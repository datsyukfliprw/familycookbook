# familycookbook

Our Family Cookbook — a static cookbook site with locally saved recipe additions.

The site is served from `dist/`. Recipe additions are saved in the browser using local storage because this deployment does not include a server-side database or upload API.

## Family Cookbook Packages (.fcp)

This build includes an experimental Family Cookbook Package importer. An `.fcp` file is JSON with:

- `format: "family-cookbook-package"`
- `version: 1`
- a `recipes` array

Use the **Import .fcp** button in the floating recipe tools to choose a package. The importer validates the package before saving the recipes into the same browser-local recipe collection used by manually added recipes.

A ready-to-test sample package is included at:

`dist/packages/smoked-greek-lemon-chicken-bowls.fcp`

The current proof of concept supports up to 100 recipes and 10 MB per package. Imported recipes remain device-local until the cookbook gains a server-side database/API.
