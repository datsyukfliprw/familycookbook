(() => {
  'use strict';

  const STORAGE_KEY = 'family-cookbook:user-recipes:v1';
  const root = () => document.getElementById('root');
  const escape = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
  const lines = value => String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  const getRecipes = () => {
    try {
      const recipes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(recipes) ? recipes : [];
    } catch { return []; }
  };
  const saveRecipes = recipes => localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  const byId = id => getRecipes().find(recipe => recipe.id === id);
  const go = path => {
    history.pushState({}, '', path);
    renderRoute();
    window.scrollTo(0, 0);
  };
  const homeLink = () => '<button class="upload-back" type="button" data-go="/recipes">← All recipes</button>';
  const image = recipe => recipe.image
    ? `<img class="upload-recipe-image" src="${escape(recipe.image)}" alt="${escape(recipe.title)}">`
    : '<div class="upload-recipe-image upload-recipe-image--blank" aria-hidden="true">⌁<span>Family recipe</span></div>';

  function renderForm() {
    const app = root();
    if (!app) return;
    app.innerHTML = `<main class="upload-page">
      ${homeLink()}
      <header class="upload-heading"><p class="eyebrow">Add to the family collection</p><h1>New recipe</h1><p>Write it down, add a photo if you have one, and it will be saved on this device.</p></header>
      <form class="upload-form" id="recipe-upload-form">
        <label>Recipe name <input name="title" required maxlength="120" placeholder="e.g. Grandma's peach cobbler" autofocus></label>
        <label>Category <input name="category" maxlength="80" placeholder="e.g. Desserts & Sweets"></label>
        <div class="upload-grid">
          <label>Prep time (minutes) <input name="prepMinutes" type="number" min="0" max="1440" inputmode="numeric" placeholder="15"></label>
          <label>Cook time (minutes) <input name="cookMinutes" type="number" min="0" max="1440" inputmode="numeric" placeholder="45"></label>
          <label>Servings <input name="yield" maxlength="60" placeholder="8 servings"></label>
        </div>
        <label>Ingredients <span>One ingredient per line</span><textarea name="ingredients" required rows="7" placeholder="2 cups flour&#10;1 cup sugar&#10;... "></textarea></label>
        <label>Directions <span>One step per line</span><textarea name="directions" required rows="7" placeholder="Preheat the oven to 350°F.&#10;Mix the ingredients.&#10;Bake until golden."></textarea></label>
        <label>Family note <span>Optional</span><textarea name="note" rows="3" placeholder="Who shared this recipe, a helpful tip, or a favorite memory."></textarea></label>
        <label>Recipe photo <span>Optional · JPEG, PNG, WebP, or GIF · max 3 MB</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
        <img class="upload-preview" alt="Selected recipe preview" hidden>
        <p class="upload-error" role="alert" hidden></p>
        <button class="upload-save" type="submit">Save recipe</button>
      </form>
    </main>`;

    const form = document.getElementById('recipe-upload-form');
    const photo = form.elements.photo;
    const preview = form.querySelector('.upload-preview');
    let photoData = '';
    photo.addEventListener('change', () => {
      const file = photo.files && photo.files[0];
      if (!file) { photoData = ''; preview.hidden = true; return; }
      if (file.size > 3 * 1024 * 1024) return showError('Please choose a photo smaller than 3 MB.');
      const reader = new FileReader();
      reader.onload = () => { photoData = String(reader.result); preview.src = photoData; preview.hidden = false; showError(''); };
      reader.onerror = () => showError('That photo could not be read. Please try another image.');
      reader.readAsDataURL(file);
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      const title = String(data.get('title') || '').trim();
      const ingredients = lines(data.get('ingredients'));
      const directions = lines(data.get('directions'));
      if (!title || !ingredients.length || !directions.length) return showError('Please add a title, at least one ingredient, and one direction.');
      const now = Date.now();
      const recipe = {
        id: `user-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title, category: String(data.get('category') || '').trim() || 'Family recipes',
        ingredients, directions, note: String(data.get('note') || '').trim(), image: photoData,
        meta: { prepMinutes: numberOrNull(data.get('prepMinutes')), cookMinutes: numberOrNull(data.get('cookMinutes')), yield: String(data.get('yield') || '').trim() },
        createdAt: now
      };
      try { saveRecipes([recipe, ...getRecipes()]); }
      catch { return showError('There was not enough storage space to save this recipe. Try a smaller photo or leave the photo out.'); }
      go(`/recipe/${recipe.id}`);
    });
  }

  function showError(message) {
    const error = document.querySelector('.upload-error');
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }
  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  function renderDetail(recipe) {
    const app = root();
    if (!app) return;
    const meta = [
      recipe.meta.prepMinutes != null && `Prep ${recipe.meta.prepMinutes} min`,
      recipe.meta.cookMinutes != null && `Cook ${recipe.meta.cookMinutes} min`,
      recipe.meta.yield && `Makes ${escape(recipe.meta.yield)}`
    ].filter(Boolean).map(item => `<span>${item}</span>`).join('');
    app.innerHTML = `<article class="upload-detail">
      <header class="upload-detail-bar">${homeLink()}<button class="upload-delete" type="button" data-delete="${escape(recipe.id)}">Delete</button></header>
      <div class="upload-detail-title"><p class="eyebrow">${escape(recipe.category)}</p><h1>${escape(recipe.title)}</h1></div>
      ${image(recipe)}
      ${meta ? `<div class="upload-meta">${meta}</div>` : ''}
      <div class="upload-detail-content">
        <section><h2>Ingredients</h2><ul>${recipe.ingredients.map(item => `<li>${escape(item)}</li>`).join('')}</ul></section>
        <section><h2>Directions</h2><ol>${recipe.directions.map(item => `<li>${escape(item)}</li>`).join('')}</ol></section>
        ${recipe.note ? `<section class="upload-note"><h2>Family note</h2><p>${escape(recipe.note)}</p></section>` : ''}
      </div>
    </article>`;
  }
  function renderList() {
    const app = root();
    if (!app) return;
    const recipes = getRecipes();
    app.innerHTML = `<main class="upload-page upload-list-page">${homeLink()}
      <header class="upload-heading"><p class="eyebrow">Saved on this device</p><h1>My recipes</h1><p>Your additions to the family cookbook.</p></header>
      <button class="upload-save upload-save--small" type="button" data-go="/add-recipe">+ Add a recipe</button>
      <div class="upload-list">${recipes.length ? recipes.map(recipe => `<button class="upload-card" data-go="/recipe/${escape(recipe.id)}"><span>${escape(recipe.category)}</span><strong>${escape(recipe.title)}</strong><small>${recipe.ingredients.length} ingredients · ${recipe.directions.length} steps</small></button>`).join('') : '<div class="empty-state">No saved recipes yet. Add your first family favorite.</div>'}</div>
    </main>`;
  }
  function renderRoute() {
    const path = location.pathname;
    if (path === '/add-recipe') return renderForm();
    if (path === '/my-recipes') return renderList();
    const match = path.match(/^\/recipe\/(user-[a-z0-9-]+)$/i);
    if (match) {
      const recipe = byId(match[1]);
      if (recipe) return renderDetail(recipe);
      go('/my-recipes');
    }
  }
  function addTools() {
    if (document.querySelector('.upload-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'upload-tools';
    tools.innerHTML = '<button type="button" data-go="/my-recipes" aria-label="View my saved recipes">▤ <span>My recipes</span></button><button type="button" data-go="/add-recipe" aria-label="Add a new recipe">＋ <span>Add recipe</span></button>';
    document.body.appendChild(tools);
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-go]');
    if (target) { event.preventDefault(); go(target.dataset.go); }
    const remove = event.target.closest('[data-delete]');
    if (remove && confirm('Delete this saved recipe?')) {
      saveRecipes(getRecipes().filter(recipe => recipe.id !== remove.dataset.delete));
      go('/my-recipes');
    }
  }, true);
  window.addEventListener('popstate', () => setTimeout(renderRoute, 0));
  const observer = new MutationObserver(() => {
    const path = location.pathname;
    const expectedMarkup = path === '/add-recipe' ? document.getElementById('recipe-upload-form')
      : path === '/my-recipes' ? document.querySelector('.upload-list-page')
      : /^\/recipe\/user-/i.test(path) ? document.querySelector('.upload-detail') : true;
    if (!expectedMarkup) renderRoute();
  });
  const boot = () => { addTools(); renderRoute(); observer.observe(root(), { childList: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);
})();
