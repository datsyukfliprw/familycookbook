(() => {
  'use strict';

  const STORAGE_KEY = 'family-cookbook:user-recipes:v1';
  const PACKAGE_FORMAT = 'family-cookbook-package';
  const PACKAGE_VERSION = 1;
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

  const listField = (value, field, recipeNumber) => {
    if (!Array.isArray(value)) {
      throw new Error(`Recipe ${recipeNumber}: "${field}" must be a list.`);
    }
    const cleaned = value.map(item => String(item || '').trim()).filter(Boolean);
    if (!cleaned.length) {
      throw new Error(`Recipe ${recipeNumber}: "${field}" cannot be empty.`);
    }
    return cleaned;
  };

  const normalizeRecipe = (recipe, index, importedAt) => {
    const recipeNumber = index + 1;
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
      throw new Error(`Recipe ${recipeNumber} is not a valid recipe object.`);
    }

    const title = String(recipe.title || '').trim();
    if (!title) throw new Error(`Recipe ${recipeNumber} is missing a title.`);

    const meta = recipe.meta && typeof recipe.meta === 'object' ? recipe.meta : {};
    const image = typeof recipe.image === 'string' &&
      /^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(recipe.image)
      ? recipe.image
      : '';

    return {
      id: `user-${importedAt}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      title: title.slice(0, 120),
      category: String(recipe.category || '').trim().slice(0, 80) || 'Family recipes',
      ingredients: listField(recipe.ingredients, 'ingredients', recipeNumber),
      directions: listField(recipe.directions, 'directions', recipeNumber),
      note: String(recipe.note || '').trim(),
      image,
      meta: {
        prepMinutes: optionalNumber(meta.prepMinutes),
        cookMinutes: optionalNumber(meta.cookMinutes),
        yield: String(meta.yield || '').trim().slice(0, 60)
      },
      createdAt: importedAt - index
    };
  };

  const parsePackage = text => {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('That file is not valid JSON and cannot be read as a Family Cookbook Package.');
    }

    if (!data || data.format !== PACKAGE_FORMAT) {
      throw new Error('Unrecognized cookbook package format.');
    }
    if (data.version !== PACKAGE_VERSION) {
      throw new Error(`Unsupported .fcp version: ${data.version}.`);
    }
    if (!Array.isArray(data.recipes) || !data.recipes.length) {
      throw new Error('This package does not contain any recipes.');
    }
    if (data.recipes.length > MAX_RECIPES) {
      throw new Error(`This importer supports up to ${MAX_RECIPES} recipes per package.`);
    }

    return data;
  };

  const importPackageFile = async file => {
    if (!file) throw new Error('No Family Cookbook Package was selected.');
    if (file.size > MAX_PACKAGE_BYTES) throw new Error('That .fcp file is larger than 10 MB.');

    const packageData = parsePackage(await file.text());
    const importedAt = Date.now();
    const recipes = packageData.recipes.map((recipe, index) => normalizeRecipe(recipe, index, importedAt));
    const packageName = String(packageData.name || '').trim();

    const label = packageName ? ` from “${packageName}”` : '';
    const confirmed = window.confirm(
      `Import ${recipes.length} recipe${recipes.length === 1 ? '' : 's'}${label}?\n\n` +
      'Recipes will be saved on this device.'
    );
    if (!confirmed) return null;

    try {
      saveRecipes([...recipes, ...getRecipes()]);
    } catch {
      throw new Error('There was not enough browser storage to import this package.');
    }

    return { count: recipes.length, name: packageName };
  };

  const goToRecipes = () => {
    history.pushState({}, '', '/my-recipes');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo(0, 0);
  };

  const installControls = () => {
    const tools = document.querySelector('.upload-tools');
    if (!tools || tools.querySelector('[data-import-fcp]')) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-import-fcp', '');
    button.setAttribute('aria-label', 'Import a Family Cookbook Package');
    button.innerHTML = '⇩ <span>Import .fcp</span>';

    const input = document.createElement('input');
    input.type = 'file';
    // Do not set an accept filter here. iOS Files treats unknown custom extensions
    // like .fcp as non-selectable when accept is restricted, even though the
    // package contents are valid JSON. We validate the package after selection.
    input.hidden = true;
    input.setAttribute('data-fcp-input', '');

    button.addEventListener('click', () => {
      input.value = '';
      input.click();
    });

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      try {
        const result = await importPackageFile(file);
        if (!result) return;
        const label = result.name ? ` from “${result.name}”` : '';
        window.alert(`Imported ${result.count} recipe${result.count === 1 ? '' : 's'}${label}.`);
        goToRecipes();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'The .fcp package could not be imported.');
      } finally {
        input.value = '';
      }
    });

    tools.append(button, input);
    return true;
  };

  const boot = () => {
    if (installControls()) return;

    const observer = new MutationObserver(() => {
      if (installControls()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.setTimeout(() => {
      installControls();
      observer.disconnect();
    }, 5000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
