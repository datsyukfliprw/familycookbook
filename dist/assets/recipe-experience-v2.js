(() => {
  'use strict';

  const STORAGE_KEY = 'family-cookbook:user-recipes:v1';
  const GREEK_TITLE = 'Smoked Greek Lemon Chicken Bowls';
  const GREEK_IMAGE = '/recipe-images/smoked-greek-lemon-chicken-bowls.webp';

  const root = () => document.getElementById('root');
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const getRecipes = () => {
    try {
      const recipes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(recipes) ? recipes : [];
    } catch {
      return [];
    }
  };

  const currentRecipeId = () => {
    const match = location.pathname.match(/^\/recipe\/(user-[a-z0-9-]+)$/i);
    return match ? match[1] : null;
  };

  const isSmokingRecipe = recipe => /smok|bbq|barbecue/i.test(String(recipe.category || '')) || Boolean(recipe.smoker);

  const titleCase = value => String(value || '')
    .toLowerCase()
    .replace(/(^|[\s/&-])\w/g, match => match.toUpperCase());

  const looksLikeHeading = value => {
    const text = String(value || '').trim();
    if (!text || text.length > 46 || /\d/.test(text)) return false;
    return text === text.toUpperCase() && /[A-Z]/.test(text);
  };

  const normalizeIngredientSections = recipe => {
    if (Array.isArray(recipe.ingredientSections) && recipe.ingredientSections.length) {
      return recipe.ingredientSections.map(section => ({
        title: String(section.title || 'Ingredients').trim(),
        items: Array.isArray(section.items) ? section.items.map(String).map(item => item.trim()).filter(Boolean) : []
      })).filter(section => section.items.length);
    }

    const flat = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const sections = [];
    let current = { title: 'Ingredients', items: [] };
    flat.forEach(item => {
      const text = String(item || '').trim();
      if (!text) return;
      if (looksLikeHeading(text)) {
        if (current.items.length) sections.push(current);
        current = { title: titleCase(text), items: [] };
      } else {
        current.items.push(text);
      }
    });
    if (current.items.length) sections.push(current);
    return sections.length ? sections : [{ title: 'Ingredients', items: flat.map(String) }];
  };

  const directionBucket = raw => {
    const key = String(raw || '').trim().toUpperCase();
    const map = {
      'MARINADE': 'Marinate',
      'SMOKER SETUP': 'Set up the smoker',
      'BEFORE SMOKING': 'Set up the smoker',
      'SMOKE': 'Smoke the chicken',
      'OPTIONAL CHAR': 'Smoke the chicken',
      'REST': 'Smoke the chicken',
      'SALAD': 'Cucumber-tomato salad',
      'TZATZIKI': 'Tzatziki',
      'RICE': 'Lemon-herb rice',
      'SMOKED LEMON VINAIGRETTE': 'Smoked lemon vinaigrette',
      'BUILD EACH BOWL': 'Build the bowls',
      'FINISH': 'Build the bowls',
      'SERVE': 'Build the bowls'
    };
    return map[key] || titleCase(key || 'Directions');
  };

  const normalizeDirectionSections = recipe => {
    if (Array.isArray(recipe.directionSections) && recipe.directionSections.length) {
      return recipe.directionSections.map(section => ({
        title: String(section.title || 'Directions').trim(),
        steps: Array.isArray(section.steps) ? section.steps.map(String).map(step => step.trim()).filter(Boolean) : []
      })).filter(section => section.steps.length);
    }

    const flat = Array.isArray(recipe.directions) ? recipe.directions : [];
    const sections = [];
    flat.forEach(step => {
      const text = String(step || '').trim();
      if (!text) return;
      const match = text.match(/^([^—]{2,40})\s+—\s+(.+)$/);
      const title = match ? directionBucket(match[1]) : 'Directions';
      const body = match ? match[2].trim() : text;
      const last = sections[sections.length - 1];
      if (last && last.title === title) last.steps.push(body);
      else sections.push({ title, steps: [body] });
    });
    return sections.length ? sections : [{ title: 'Directions', steps: flat.map(String) }];
  };

  const greekFallbackSmoker = () => ({
    temperatureF: 300,
    wood: '75% white oak · 25% apple or pear',
    smoke: 'Clean fire · thin blue smoke',
    targetInternalF: '175–180°F',
    time: '45–70 min',
    finish: 'Optional 60–90 sec/side high-heat char'
  });

  const normalizeSmoker = recipe => {
    if (recipe.smoker && typeof recipe.smoker === 'object') return recipe.smoker;
    if (String(recipe.title || '').trim() === GREEK_TITLE) return greekFallbackSmoker();
    return null;
  };

  const normalizeImage = recipe => {
    const image = String(recipe.image || '').trim();
    if (image) return image;
    return String(recipe.title || '').trim() === GREEK_TITLE ? GREEK_IMAGE : '';
  };

  const metaChips = recipe => {
    const meta = recipe.meta && typeof recipe.meta === 'object' ? recipe.meta : {};
    const chips = [];
    if (meta.prepMinutes != null) chips.push(['Prep', `${meta.prepMinutes} min`]);
    if (meta.marinate) chips.push(['Marinate', String(meta.marinate)]);
    else if (String(recipe.title || '').trim() === GREEK_TITLE) chips.push(['Marinate', '2–8 hr']);
    if (meta.cookLabel) chips.push([isSmokingRecipe(recipe) ? 'Smoke' : 'Cook', String(meta.cookLabel)]);
    else if (String(recipe.title || '').trim() === GREEK_TITLE) chips.push(['Smoke', '45–75 min']);
    else if (meta.cookMinutes != null) chips.push([isSmokingRecipe(recipe) ? 'Smoke' : 'Cook', `${meta.cookMinutes} min`]);
    if (meta.yield) chips.push(['Serves', String(meta.yield).replace(/^serves\s+/i, '').replace(/\s+servings?$/i, '')]);
    return chips;
  };

  const renderHero = recipe => {
    const image = normalizeImage(recipe);
    return image
      ? `<img class="rx-hero-image" src="${esc(image)}" alt="${esc(recipe.title)}">`
      : `<div class="rx-hero-image rx-hero-empty" aria-hidden="true"><span>Family recipe</span></div>`;
  };

  const renderSmoker = smoker => {
    if (!smoker) return '';
    const rows = [
      ['Pit temp', smoker.temperatureF != null ? `${smoker.temperatureF}°F` : smoker.temperature],
      ['Wood', smoker.wood],
      ['Smoke', smoker.smoke],
      ['Pull temp', smoker.targetInternalF],
      ['Time', smoker.time],
      ['Finish', smoker.finish]
    ].filter(([, value]) => value != null && String(value).trim());
    return `<section class="rx-smoker-card" id="smoker-setup">
      <div class="rx-smoker-card-head"><span class="rx-fire-mark" aria-hidden="true">♨</span><div><p>Smoking setup</p><h2>Dial in the pit</h2></div></div>
      <dl>${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    </section>`;
  };

  const renderIngredientSections = sections => `<section class="rx-section" id="ingredients">
    <div class="rx-section-heading"><p>Prep station</p><h2>Ingredients</h2></div>
    <div class="rx-ingredient-groups">${sections.map((section, sectionIndex) => `
      <article class="rx-ingredient-group" id="ingredient-${sectionIndex}">
        <h3>${esc(section.title)}</h3>
        <ul>${section.items.map(item => `<li><label><input type="checkbox" aria-label="Mark ${esc(item)} complete"><span>${esc(item)}</span></label></li>`).join('')}</ul>
      </article>`).join('')}</div>
  </section>`;

  const renderDirectionSections = sections => `<section class="rx-section" id="directions">
      <div class="rx-section-heading"><p>Cook flow</p><h2>Directions</h2></div>
      <div class="rx-direction-groups">${sections.map(section => `<details class="rx-direction-group" open>
        <summary><span>${esc(section.title)}</span><small>${section.steps.length} step${section.steps.length === 1 ? '' : 's'}</small></summary>
        <ol>${section.steps.map(step => `<li><span>${esc(step)}</span></li>`).join('')}</ol>
      </details>`).join('')}</div>
    </section>`;

  const renderNote = recipe => {
    const note = String(recipe.pitNotes || recipe.note || '').trim();
    if (!note) return '';
    const title = isSmokingRecipe(recipe) ? 'Pit notes' : 'Family note';
    return `<section class="rx-note" id="pit-notes"><p>${isSmokingRecipe(recipe) ? 'From the pit' : 'From the family'}</p><h2>${title}</h2><div>${esc(note)}</div></section>`;
  };

  const renderDetail = recipe => {
    const app = root();
    if (!app) return;
    const smoker = normalizeSmoker(recipe);
    const ingredientSections = normalizeIngredientSections(recipe);
    const directionSections = normalizeDirectionSections(recipe);
    const chips = metaChips(recipe);
    const smoking = isSmokingRecipe(recipe);

    document.body.classList.add('recipe-detail-v2-active');
    app.innerHTML = `<article class="rx-detail ${smoking ? 'rx-detail--smoker' : ''}">
      <header class="rx-topbar">
        <button type="button" data-rx-go="/recipes">← All recipes</button>
        <button class="rx-delete" type="button" data-rx-delete="${esc(recipe.id)}">Delete</button>
      </header>
      <div class="rx-title-block">
        <p class="rx-category">${esc(recipe.category || 'Family recipe')}</p>
        <h1>${esc(recipe.title)}</h1>
      </div>
      ${renderHero(recipe)}
      ${chips.length ? `<div class="rx-meta">${chips.map(([label, value]) => `<span><small>${esc(label)}</small><strong>${esc(value)}</strong></span>`).join('')}</div>` : ''}
      <nav class="rx-jump" aria-label="Recipe sections">
        ${smoker ? '<a href="#smoker-setup">Smoker</a>' : ''}
        <a href="#ingredients">Ingredients</a>
        <a href="#directions">Directions</a>
        ${(recipe.pitNotes || recipe.note) ? '<a href="#pit-notes">Notes</a>' : ''}
      </nav>
      <div class="rx-content">
        ${renderSmoker(smoker)}
        ${renderIngredientSections(ingredientSections)}
        ${renderDirectionSections(directionSections)}
        ${renderNote(recipe)}
      </div>
    </article>`;
  };

  const route = () => {
    const id = currentRecipeId();
    document.body.classList.toggle('recipe-detail-v2-active', Boolean(id));
    if (!id) return;
    const recipe = getRecipes().find(item => item && item.id === id);
    if (!recipe) return;
    const app = root();
    if (app && app.querySelector('.rx-detail')) return;
    renderDetail(recipe);
  };

  const navigate = path => {
    document.body.classList.remove('recipe-detail-v2-active');
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo(0, 0);
  };

  document.addEventListener('click', event => {
    const go = event.target.closest('[data-rx-go]');
    if (go) {
      event.preventDefault();
      navigate(go.getAttribute('data-rx-go'));
      return;
    }
    const remove = event.target.closest('[data-rx-delete]');
    if (remove && window.confirm('Delete this saved recipe?')) {
      const id = remove.getAttribute('data-rx-delete');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getRecipes().filter(recipe => recipe.id !== id)));
      navigate('/my-recipes');
    }
  }, true);

  window.addEventListener('popstate', () => window.setTimeout(route, 25));

  const boot = () => {
    route();
    const target = root();
    if (!target) return;
    const observer = new MutationObserver(() => {
      if (!currentRecipeId()) {
        document.body.classList.remove('recipe-detail-v2-active');
        return;
      }
      if (!target.querySelector('.rx-detail')) window.setTimeout(route, 0);
    });
    observer.observe(target, { childList: true, subtree: false });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
