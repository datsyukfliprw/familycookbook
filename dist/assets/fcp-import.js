(() => {
  'use strict';

  const STORAGE_KEY = 'family-cookbook:user-recipes:v1';
  const PACKAGE_FORMAT = 'family-cookbook-package';
  const SUPPORTED_VERSIONS = new Set([1, 2]);
  const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
  const MAX_RECIPES = 100;

  const getRecipes = () => {
    try {
      const recipes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(recipes) ? recipes : [];
    } catch {
      return [];
    }
  };

  const saveRecipes = recipes => localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  const optionalNumber = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };

  const safeString = (value, max = 4000) => String(value || '').trim().slice(0, max);
  const listField = (value, field, recipeNumber) => {
    if (!Array.isArray(value)) throw new Error(`Recipe ${recipeNumber}: "${field}" must be a list.`);
    const cleaned = value.map(item => safeString(item, 1000)).filter(Boolean);
    if (!cleaned.length) throw new Error(`Recipe ${recipeNumber}: "${field}" cannot be empty.`);
    return cleaned;
  };

  const sectionField = (value, field, childField, recipeNumber) => {
    if (!Array.isArray(value)) return null;
    const sections = value.map(section => {
      if (!section || typeof section !== 'object') return null;
      const title = safeString(section.title || field, 80);
      const children = Array.isArray(section[childField])
        ? section[childField].map(item => safeString(item, 1400)).filter(Boolean)
        : [];
      return children.length ? { title, [childField]: children } : null;
    }).filter(Boolean);
    if (!sections.length) throw new Error(`Recipe ${recipeNumber}: "${field}" cannot be empty.`);
    return sections;
  };

  const flattenSections = (sections, childField) => sections.flatMap(section => section[childField]);

  const validImage = value => {
    const image = safeString(value, 4_500_000);
    if (/^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(image)) return image;
    if (/^\/recipe-images\/[a-z0-9._\/-]+$/i.test(image)) return image;
    return '';
  };

  const normalizeRecipe = (recipe, index, importedAt) => {
    const recipeNumber = index + 1;
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error(`Recipe ${recipeNumber} is not a valid recipe object.`);
    const title = safeString(recipe.title, 120);
    if (!title) throw new Error(`Recipe ${recipeNumber} is missing a title.`);

    const ingredientSections = sectionField(recipe.ingredientSections, 'ingredientSections', 'items', recipeNumber);
    const directionSections = sectionField(recipe.directionSections, 'directionSections', 'steps', recipeNumber);
    const ingredients = ingredientSections
      ? flattenSections(ingredientSections, 'items')
      : listField(recipe.ingredients, 'ingredients', recipeNumber);
    const directions = directionSections
      ? flattenSections(directionSections, 'steps')
      : listField(recipe.directions, 'directions', recipeNumber);
    const meta = recipe.meta && typeof recipe.meta === 'object' ? recipe.meta : {};
    const smoker = recipe.smoker && typeof recipe.smoker === 'object' ? {
      temperatureF: optionalNumber(recipe.smoker.temperatureF),
      wood: safeString(recipe.smoker.wood, 160),
      smoke: safeString(recipe.smoker.smoke, 160),
      targetInternalF: safeString(recipe.smoker.targetInternalF, 80),
      time: safeString(recipe.smoker.time, 80),
      finish: safeString(recipe.smoker.finish, 180)
    } : null;

    return {
      id: `user-${importedAt}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      category: safeString(recipe.category, 80) || 'Family recipes',
      ingredients,
      directions,
      ingredientSections: ingredientSections || undefined,
      directionSections: directionSections || undefined,
      smoker: smoker || undefined,
      pitNotes: safeString(recipe.pitNotes, 5000) || undefined,
      note: safeString(recipe.note, 5000),
      image: validImage(recipe.image),
      meta: {
        prepMinutes: optionalNumber(meta.prepMinutes),
        cookMinutes: optionalNumber(meta.cookMinutes),
        cookLabel: safeString(meta.cookLabel, 60),
        marinate: safeString(meta.marinate, 60),
        yield: safeString(meta.yield, 60)
      },
      createdAt: importedAt - index
    };
  };

  const parsePackage = text => {
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('That file is not valid JSON and cannot be read as a Family Cookbook Package.'); }
    if (!data || data.format !== PACKAGE_FORMAT) throw new Error('Unrecognized cookbook package format.');
    if (!SUPPORTED_VERSIONS.has(data.version)) throw new Error(`Unsupported .fcp version: ${data.version}.`);
    if (!Array.isArray(data.recipes) || !data.recipes.length) throw new Error('This package does not contain any recipes.');
    if (data.recipes.length > MAX_RECIPES) throw new Error(`This importer supports up to ${MAX_RECIPES} recipes per package.`);
    return data;
  };

  const mergeRecipes = imported => {
    const existing = getRecipes();
    let updated = 0;
    imported.forEach(recipe => {
      const index = existing.findIndex(item => item &&
        String(item.title || '').trim().toLowerCase() === recipe.title.toLowerCase() &&
        String(item.category || '').trim().toLowerCase() === recipe.category.toLowerCase());
      if (index >= 0) {
        const previous = existing[index];
        existing[index] = { ...recipe, id: previous.id, createdAt: previous.createdAt || recipe.createdAt };
        updated += 1;
      } else {
        existing.unshift(recipe);
      }
    });
    return { recipes: existing, updated };
  };

  const importPackageFile = async file => {
    if (!file) throw new Error('No Family Cookbook Package was selected.');
    if (file.size > MAX_PACKAGE_BYTES) throw new Error('That .fcp file is larger than 10 MB.');
    const packageData = parsePackage(await file.text());
    const importedAt = Date.now();
    const imported = packageData.recipes.map((recipe, index) => normalizeRecipe(recipe, index, importedAt));
    const packageName = safeString(packageData.name, 120);
    const existing = getRecipes();
    const duplicateCount = imported.filter(recipe => existing.some(item => item &&
      String(item.title || '').trim().toLowerCase() === recipe.title.toLowerCase() &&
      String(item.category || '').trim().toLowerCase() === recipe.category.toLowerCase())).length;
    const label = packageName ? ` from “${packageName}”` : '';
    const updateMessage = duplicateCount ? `\n\n${duplicateCount} matching recipe${duplicateCount === 1 ? '' : 's'} will be updated instead of duplicated.` : '';
    if (!window.confirm(`Import ${imported.length} recipe${imported.length === 1 ? '' : 's'}${label}?${updateMessage}\n\nRecipes will be saved on this device.`)) return null;
    const merged = mergeRecipes(imported);
    try { saveRecipes(merged.recipes); }
    catch { throw new Error('There was not enough browser storage to import this package.'); }
    return { count: imported.length, updated: merged.updated, name: packageName };
  };

  const goToRecipes = () => {
    history.pushState({}, '', '/my-recipes');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo(0, 0);
  };

  const installControls = () => {
    const tools = document.querySelector('.upload-tools');
    if (!tools) return false;
    tools.querySelector('[data-import-fcp]')?.remove();
    tools.querySelector('[data-fcp-input]')?.remove();
    if (tools.querySelector('[data-import-fcp-v2]')) return true;

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-import-fcp-v2', '');
    button.setAttribute('aria-label', 'Import a Family Cookbook Package');
    button.innerHTML = '⇩ <span>Import .fcp</span>';
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    input.setAttribute('data-fcp-input-v2', '');

    button.addEventListener('click', () => { input.value = ''; input.click(); });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const result = await importPackageFile(file);
        if (!result) return;
        const updated = result.updated ? ` · ${result.updated} updated` : '';
        window.alert(`Imported ${result.count} recipe${result.count === 1 ? '' : 's'}${updated}.`);
        goToRecipes();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'The .fcp package could not be imported.');
      } finally { input.value = ''; }
    });
    tools.append(button, input);
    return true;
  };

  const boot = () => {
    const tryInstall = () => installControls();
    if (tryInstall()) return;
    const observer = new MutationObserver(() => { if (tryInstall()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { tryInstall(); observer.disconnect(); }, 5000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
