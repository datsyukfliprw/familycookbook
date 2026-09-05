import { previewFcp } from './fcp.js';
import { groceryFromRecipes } from './grocery.js';
import { migrateBundledLegacyCatalog } from './legacy-catalog.js';
import { searchRecipes } from './search.js';
import { loadCookProgress, loadState, saveCookProgress, saveState } from './storage.js';
import type { CookbookState, DirectionSection, ImportPreview, IngredientSection, Recipe, RecipeStep } from './types.js';

let state: CookbookState = loadState();
let importPreview: ImportPreview | null = null;
const servingsByRecipe = new Map<string, number>();
const checkedIngredients = new Set<string>();
const TIMER_KEY = 'family-cookbook:timers:v1';

type TimerMap = Record<string, { label: string; endsAt: number }>;
const getTimers = (): TimerMap => { try { return JSON.parse(localStorage.getItem(TIMER_KEY) ?? '{}') as TimerMap; } catch { return {}; } };
const setTimers = (timers: TimerMap) => localStorage.setItem(TIMER_KEY, JSON.stringify(timers));

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root not found.');

const e = (value: unknown): string => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const fmtDate = (at?: number) => at ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(at) : 'Never';
const route = () => location.hash.split('?')[0]!.replace(/^#\/?/, '').split('/').filter(Boolean);
const go = (path: string) => { location.hash = `#/${path.replace(/^\//, '')}`; };
const findRecipe = (id: string | undefined) => state.recipes.find(recipe => recipe.id === id);
const flatSteps = (recipe: Recipe): { section: string; step: RecipeStep }[] => recipe.directionSections.flatMap(section => section.steps.map(step => ({ section: section.title, step })));
const persist = () => saveState(state);
const isPitRecipe = (recipe: Recipe) => Boolean(recipe.smoker) || /smok|bbq|barbecue/i.test(recipe.category) || recipe.collections.some(name => /pit house|smok/i.test(name));
type Theme = 'family' | 'pit';
const setTheme = (theme: Theme) => { document.documentElement.dataset.theme = theme; };

const icon = (name: string) => ({
  search: '⌕', heart: '♡', heartFilled: '♥', book: '⌂', collection: '▦', grocery: '✓', plus: '+', smoker: '♨', clock: '◷', back: '←', edit: '✎', import: '⇩', legacy: '↗'
})[name] ?? '';

const header = (theme: Theme = 'family') => {
  const pit = theme === 'pit';
  return `
<header class="site-header ${pit ? 'pit-header' : ''}">
  <a class="brand" href="${pit ? '#/pit-house' : '#/'}" aria-label="${pit ? "Jay's Pit House" : 'Family Cookbook'} home"><span class="brand-mark">${pit ? 'JP' : 'FC'}</span><span><strong>${pit ? "Jay's Pit House" : 'Family Cookbook'}</strong><small>${pit ? 'Smoke · fire · patience' : 'Recipes worth keeping'}</small></span></a>
  <nav aria-label="Primary navigation">
    <a href="#/" data-nav="home">${icon('book')}<span>Family Cookbook</span></a>
    <a href="#/pit-house" data-nav="pit">${icon('smoker')}<span>Jay’s Pit House</span></a>
    <a href="#/collections" data-nav="collections">${icon('collection')}<span>Collections</span></a>
    <a href="#/grocery" data-nav="grocery">${icon('grocery')}<span>Grocery</span></a>
  </nav>
  <div class="header-actions"><a class="button ghost" href="#/import">${icon('import')} Import</a><a class="button primary" href="#/new">${icon('plus')} Add recipe</a></div>
</header>`;
};

const page = (content: string, extraClass = '', theme: Theme = 'family') => `${header(theme)}<main class="page ${extraClass}">${content}</main><div id="toast" class="toast" role="status" aria-live="polite"></div>`;
const toast = (message: string) => { const node = document.querySelector<HTMLElement>('#toast'); if (!node) return; node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2600); };

const recipeCard = (recipe: Recipe) => `
<article class="recipe-card ${isPitRecipe(recipe) ? 'pit-card' : 'family-card'}">
  <a class="card-image" href="#/recipe/${e(recipe.id)}" aria-label="Open ${e(recipe.title)}">
    ${recipe.image ? `<img src="${e(recipe.image)}" alt="" loading="lazy">` : `<div class="image-placeholder">${isPitRecipe(recipe) ? 'Pit House recipe' : 'Family recipe'}</div>`}
    ${recipe.favorite ? `<span class="favorite-badge" aria-label="Favorite">♥</span>` : ''}
  </a>
  <div class="card-body">
    <div class="eyebrow">${e(recipe.category)}</div>
    <h3><a href="#/recipe/${e(recipe.id)}">${e(recipe.title)}</a></h3>
    <p>${e(recipe.description ?? recipe.story ?? recipe.note ?? '')}</p>
    <div class="card-meta">${recipe.prepMinutes ? `<span>${icon('clock')} ${recipe.prepMinutes} min prep</span>` : ''}${recipe.smoker ? `<span>${icon('smoker')} ${e(recipe.smoker.pitTemperatureF ?? '')}°F</span>` : ''}${recipe.author ? `<span>From ${e(recipe.author)}</span>` : ''}</div>
  </div>
</article>`;

const collectionCard = (name: string, recipes: Recipe[]) => {
  const image = recipes.find(recipe => recipe.image)?.image;
  return `<a class="collection-card" href="#/collections/${encodeURIComponent(name)}">${image ? `<img src="${e(image)}" alt="" loading="lazy">` : '<div class="image-placeholder"></div>'}<span><small>${recipes.length} recipe${recipes.length === 1 ? '' : 's'}</small><strong>${e(name)}</strong></span></a>`;
};

const searchBox = (value = '', scope: Theme = 'family') => `
<form class="hero-search" id="search-form" role="search" data-scope="${scope}">
  <span aria-hidden="true">${icon('search')}</span>
  <label class="sr-only" for="recipe-search">Search ${scope === 'pit' ? "Jay's Pit House" : 'family recipes'}</label>
  <input id="recipe-search" name="q" value="${e(value)}" autocomplete="off" placeholder="${scope === 'pit' ? 'Search smoked chicken, beef, sides, wood…' : 'Search recipes, ingredients, people, or collections…'}">
  <button class="button primary" type="submit">Search</button>
</form>`;

const activeTimersMarkup = () => {
  const timers = Object.values(getTimers()).filter(timer => timer.endsAt > Date.now());
  if (!timers.length) return '';
  return `<div class="timer-strip"><strong>${timers.length} active timer${timers.length === 1 ? '' : 's'}</strong>${timers.map(timer => `<span data-timer-end="${timer.endsAt}">${e(timer.label)} · <b>--:--</b></span>`).join('')}</div>`;
};

const home = () => {
  const familyRecipes = state.recipes.filter(recipe => !isPitRecipe(recipe));
  const pitRecipes = state.recipes.filter(isPitRecipe);
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const query = params.get('q') ?? '';
  const results = searchRecipes(familyRecipes, query);
  const recent = [...familyRecipes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const cookAgain = [...familyRecipes].filter(recipe => recipe.lastCookedAt).sort((a, b) => (b.lastCookedAt ?? 0) - (a.lastCookedAt ?? 0)).slice(0, 4);
  const favorites = familyRecipes.filter(recipe => recipe.favorite).slice(0, 6);
  const collections = new Map<string, Recipe[]>();
  familyRecipes.forEach(recipe => recipe.collections.forEach(name => collections.set(name, [...(collections.get(name) ?? []), recipe])));
  const progress = loadCookProgress();
  const progressRecipe = progress ? findRecipe(progress.recipeId) : undefined;
  if (query) return page(`${activeTimersMarkup()}<section class="search-page"><a class="text-link" href="#/">${icon('back')} Home</a><h1>Search the family cookbook</h1>${searchBox(query)}<div class="section-heading"><div><span class="eyebrow">Results</span><h2>${results.length} match${results.length === 1 ? '' : 'es'}</h2></div></div>${results.length ? `<div class="recipe-grid">${results.map(recipeCard).join('')}</div>` : `<div class="empty-state"><h2>No family recipes matched “${e(query)}”</h2><p>Try an ingredient, family member, collection, or a phrase like “under 30 min.” For smoker recipes, head into Jay’s Pit House.</p><a class="button ghost" href="#/pit-house">Go to Jay’s Pit House</a></div>`}</section>`, 'search-page');

  const feature = favorites[0] ?? familyRecipes[0];
  const pitFeature = pitRecipes.find(recipe => recipe.image) ?? pitRecipes[0];
  return page(`
    ${activeTimersMarkup()}
    ${progressRecipe ? `<section class="resume-banner"><div><span class="eyebrow">Still cooking?</span><strong>Continue ${e(progressRecipe.title)}</strong><small>Step ${progress!.stepIndex + 1} of ${flatSteps(progressRecipe).length}</small></div><a class="button primary" href="#/cook/${e(progressRecipe.id)}">Resume cooking</a></section>` : ''}
    <section class="hero family-hero"><div class="hero-copy"><span class="eyebrow">Our family · our food · our stories</span><h1>The recipes we’ll want <em>thirty years from now.</em></h1><p>A warmer, easier family cookbook: the food first, the ingredients easy to reach, and the memories still there when you want them.</p>${searchBox()}</div><div class="hero-art"><div class="hero-card"><span>Tonight’s idea</span><strong>${e(feature?.title ?? 'Add your first family recipe')}</strong>${feature?.image ? `<img src="${e(feature.image)}" alt="">` : ''}</div></div></section>
    ${cookAgain.length ? `<section><div class="section-heading"><div><span class="eyebrow">Back by request</span><h2>Cook again</h2></div></div><div class="recipe-grid compact">${cookAgain.map(recipeCard).join('')}</div></section>` : ''}
    <section><div class="section-heading"><div><span class="eyebrow">The ones we keep reaching for</span><h2>Family favorites</h2></div></div>${favorites.length ? `<div class="recipe-grid">${favorites.map(recipeCard).join('')}</div>` : `<div class="empty-state compact"><p>Tap the heart on a recipe to build the family favorites shelf.</p></div>`}</section>
    ${pitRecipes.length ? `<section class="pit-entry"><div class="pit-entry-copy"><span class="eyebrow">A different side of the cookbook</span><h2>Jay’s Pit House</h2><p>${pitRecipes.length} smoker recipe${pitRecipes.length === 1 ? '' : 's'}, with pit temperatures, wood, target temps, cook mode, and a look built for the smoke.</p><a class="button pit-button" href="#/pit-house">Enter the Pit House ${icon('smoker')}</a></div>${pitFeature?.image ? `<a class="pit-entry-image" href="#/pit-house"><img src="${e(pitFeature.image)}" alt=""><span>${e(pitFeature.title)}</span></a>` : ''}</section>` : ''}
    <section><div class="section-heading"><div><span class="eyebrow">Browse by mood, memory, or meal</span><h2>Our collections</h2></div><a class="text-link" href="#/collections">All collections →</a></div>${collections.size ? `<div class="collection-grid">${[...collections.entries()].slice(0, 6).map(([name, recipes]) => collectionCard(name, recipes)).join('')}</div>` : '<div class="empty-state compact"><p>Collections will grow as recipes are added.</p></div>'}</section>
    <section><div class="section-heading"><div><span class="eyebrow">Fresh in the book</span><h2>Recently added</h2></div></div>${recent.length ? `<div class="recipe-grid compact">${recent.map(recipeCard).join('')}</div>` : '<div class="empty-state"><h2>Your family shelf is ready.</h2><p>Add a recipe or import a package to get started.</p></div>'}</section>
  `, 'home-page');
};

const pitHouse = () => {
  const recipes = state.recipes.filter(isPitRecipe);
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const query = params.get('q') ?? '';
  const results = searchRecipes(recipes, query);
  const favorites = recipes.filter(recipe => recipe.favorite);
  const feature = favorites.find(recipe => recipe.image) ?? recipes.find(recipe => recipe.image) ?? recipes[0];
  const chicken = recipes.filter(recipe => /chicken|turkey|poultry/i.test(`${recipe.title} ${recipe.tags.join(' ')}`)).slice(0, 4);
  const beef = recipes.filter(recipe => /beef|brisket|chuck|barbacoa|burnt end/i.test(`${recipe.title} ${recipe.tags.join(' ')}`)).slice(0, 4);
  if (query) return page(`${activeTimersMarkup()}<section class="search-page pit-search"><a class="text-link" href="#/pit-house">${icon('back')} Pit House</a><span class="eyebrow">Search the smoke</span><h1>Find a Pit House recipe</h1>${searchBox(query, 'pit')}<div class="section-heading"><div><span class="eyebrow">Results</span><h2>${results.length} match${results.length === 1 ? '' : 'es'}</h2></div></div>${results.length ? `<div class="recipe-grid">${results.map(recipeCard).join('')}</div>` : `<div class="empty-state"><h2>Nothing on the pit matched “${e(query)}”.</h2><p>Try a meat, dish, wood, or cooking style.</p></div>`}</section>`, 'pit-house-page', 'pit');

  return page(`
    ${activeTimersMarkup()}
    <section class="pit-hero"><div class="pit-hero-copy"><span class="pit-kicker">Smoke · fire · patience</span><h1>Jay’s <em>Pit House</em></h1><p>Smoker recipes get their own room: darker, sharper, and built around the details that matter at the pit.</p>${searchBox('', 'pit')}<div class="pit-stats"><span><b>${recipes.length}</b><small>pit recipes</small></span><span><b>${favorites.length}</b><small>favorites</small></span><span><b>${recipes.filter(recipe => recipe.smoker?.wood).length}</b><small>wood profiles</small></span></div></div>${feature ? `<a class="pit-feature" href="#/recipe/${e(feature.id)}">${feature.image ? `<img src="${e(feature.image)}" alt="">` : '<div class="image-placeholder">Pit House</div>'}<span>From the pit</span><strong>${e(feature.title)}</strong>${feature.smoker?.pitTemperatureF ? `<small>${feature.smoker.pitTemperatureF}°F · ${e(feature.smoker.wood ?? 'clean smoke')}</small>` : ''}</a>` : ''}</section>
    ${favorites.length ? `<section><div class="section-heading"><div><span class="eyebrow">Keepers</span><h2>Pit favorites</h2></div></div><div class="recipe-grid">${favorites.slice(0, 6).map(recipeCard).join('')}</div></section>` : ''}
    ${chicken.length ? `<section><div class="section-heading"><div><span class="eyebrow">Bird on the grate</span><h2>Chicken & poultry</h2></div></div><div class="recipe-grid compact">${chicken.map(recipeCard).join('')}</div></section>` : ''}
    ${beef.length ? `<section><div class="section-heading"><div><span class="eyebrow">Low, slow, worth it</span><h2>Beef</h2></div></div><div class="recipe-grid compact">${beef.map(recipeCard).join('')}</div></section>` : ''}
    <section><div class="section-heading"><div><span class="eyebrow">The whole smoke book</span><h2>All Pit House recipes</h2></div><span>${recipes.length} total</span></div>${recipes.length ? `<div class="recipe-grid">${recipes.map(recipeCard).join('')}</div>` : `<div class="empty-state"><h2>The pit is ready.</h2><p>Add a recipe with smoker details and it will live here automatically.</p><a class="button primary" href="#/new">Add a smoker recipe</a></div>`}</section>
    <section class="family-return"><div><span class="eyebrow">Back inside</span><h2>Looking for the family cookbook?</h2><p>The warm, everyday recipes live in their own brighter space.</p></div><a class="button ghost" href="#/">Open Family Cookbook</a></section>
  `, 'pit-house-page', 'pit');
};

const smokeProfile = (recipe: Recipe) => recipe.smoker ? `<aside class="smoke-profile"><div class="section-heading mini"><div><span class="eyebrow">Fire plan</span><h2>Smoke profile</h2></div><span class="smoke-icon">${icon('smoker')}</span></div><dl>${recipe.smoker.pitTemperatureF ? `<div><dt>Pit</dt><dd>${e(recipe.smoker.pitTemperatureF)}°F</dd></div>` : ''}${recipe.smoker.wood ? `<div><dt>Wood</dt><dd>${e(recipe.smoker.wood)}</dd></div>` : ''}${recipe.smoker.smoke ? `<div><dt>Smoke</dt><dd>${e(recipe.smoker.smoke)}</dd></div>` : ''}${recipe.smoker.targetInternalF ? `<div><dt>Pull</dt><dd>${e(recipe.smoker.targetInternalF)}</dd></div>` : ''}${recipe.smoker.time ? `<div><dt>Time</dt><dd>${e(recipe.smoker.time)}</dd></div>` : ''}${recipe.smoker.restMinutes ? `<div><dt>Rest</dt><dd>${recipe.smoker.restMinutes} min</dd></div>` : ''}</dl>${recipe.smoker.finish ? `<p class="profile-note"><strong>Finish</strong>${e(recipe.smoker.finish)}</p>` : ''}</aside>` : '';

const scaledIngredient = (raw: string, current: number, base: number) => {
  if (current === base || !base) return raw;
  const factor = current / base;
  const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s+(.*)$/);
  if (!match) return raw;
  const quantity = Number(match[1]);
  return `${Number((quantity * factor).toFixed(2))} ${match[2]}`;
};

const recipeDetail = (recipe: Recipe) => {
  const servings = servingsByRecipe.get(recipe.id) ?? recipe.servings;
  const allSteps = flatSteps(recipe);
  const pit = isPitRecipe(recipe);
  const theme: Theme = pit ? 'pit' : 'family';
  const backHref = pit ? '#/pit-house' : '#/';
  const backLabel = pit ? 'Pit House' : 'Cookbook';
  const ingredientsMarkup = recipe.ingredientSections.map(section => `<section><h2>${e(section.title)}</h2>${section.ingredients.map(item => `<label class="ingredient ${checkedIngredients.has(item.id) ? 'checked' : ''}"><input type="checkbox" data-action="ingredient-check" data-ingredient="${e(item.id)}" ${checkedIngredients.has(item.id) ? 'checked' : ''}><span>${e(scaledIngredient(item.raw, servings, recipe.servings))}</span></label>`).join('')}</section>`).join('');
  const directionsMarkup = recipe.directionSections.map(section => `<section><h2>${e(section.title)}</h2>${section.steps.map((step, i) => `<div class="direction-step"><span>${i + 1}</span><p>${e(step.text)}</p></div>`).join('')}</section>`).join('');
  return page(`
    <div class="detail-top"><a class="text-link" href="${backHref}">${icon('back')} ${backLabel}</a><div class="detail-actions"><button class="icon-button" data-action="favorite" data-id="${e(recipe.id)}" aria-label="${recipe.favorite ? 'Remove from favorites' : 'Add to favorites'}">${recipe.favorite ? icon('heartFilled') : icon('heart')}</button><a class="button ghost" href="#/edit/${e(recipe.id)}">${icon('edit')} Edit</a><a class="button primary" href="#/cook/${e(recipe.id)}">Start cooking</a></div></div>
    <section class="recipe-hero ${pit ? 'pit-recipe-hero' : 'family-recipe-hero'}">
      <div class="recipe-hero-image">${recipe.image ? `<img src="${e(recipe.image)}" alt="${e(recipe.title)}">` : `<div class="image-placeholder">${pit ? 'Pit House recipe' : 'Family recipe'}</div>`}</div>
      <div class="recipe-hero-copy"><span class="eyebrow">${pit ? "Jay's Pit House · " : ''}${e(recipe.category)}</span><h1>${e(recipe.title)}</h1>${recipe.author ? `<p class="byline">From <strong>${e(recipe.author)}</strong>${recipe.addedBy && recipe.addedBy !== recipe.author ? ` · added by ${e(recipe.addedBy)}` : ''}</p>` : ''}<p class="lede">${e(recipe.description ?? recipe.note ?? '')}</p><div class="stat-row"><span><b>${servings}</b><small>servings</small></span>${recipe.prepMinutes ? `<span><b>${recipe.prepMinutes}m</b><small>prep</small></span>` : ''}${recipe.cookMinutes || recipe.cookLabel ? `<span><b>${e(recipe.cookMinutes ? `${recipe.cookMinutes}m` : recipe.cookLabel)}</b><small>cook</small></span>` : ''}${recipe.lastCookedAt ? `<span><b>${fmtDate(recipe.lastCookedAt)}</b><small>last cooked</small></span>` : ''}</div></div>
    </section>
    ${pit && recipe.smoker ? `<section class="pit-quick-profile">${smokeProfile(recipe)}</section>` : ''}
    <section class="ingredients-first" aria-labelledby="ingredients-heading">
      <div class="section-heading ingredient-heading"><div><span class="eyebrow">${pit ? 'Load the tray' : 'What you need'}</span><h2 id="ingredients-heading">Ingredients</h2></div><a class="text-link" href="#/cook/${e(recipe.id)}">Cook mode →</a></div>
      <div class="serving-control"><div><span class="eyebrow">Scale recipe</span><strong>Servings</strong></div><div><button data-action="servings" data-delta="-1" data-id="${e(recipe.id)}" aria-label="Decrease servings">−</button><output>${servings}</output><button data-action="servings" data-delta="1" data-id="${e(recipe.id)}" aria-label="Increase servings">+</button></div></div>
      <div class="ingredients ingredient-grid">${ingredientsMarkup}</div>
      <div class="recipe-tools"><button class="button ghost" data-action="add-grocery" data-id="${e(recipe.id)}">Add ingredients to grocery list</button><a class="button primary" href="#/cook/${e(recipe.id)}">Start cooking</a></div>
    </section>
    <section class="directions-block" aria-labelledby="directions-heading"><div class="section-heading"><div><span class="eyebrow">${allSteps.length} step${allSteps.length === 1 ? '' : 's'}</span><h2 id="directions-heading">Directions</h2></div><a class="button ghost" href="#/cook/${e(recipe.id)}">Open cook mode</a></div><div class="directions">${directionsMarkup}</div></section>
    ${recipe.story ? `<section class="story-card lower-story"><span class="eyebrow">The story</span><blockquote>${e(recipe.story)}</blockquote></section>` : ''}
    <section class="recipe-aftercare"><div>${recipe.pitNotes ? `<aside class="pit-note"><span class="eyebrow">${pit ? 'Pit notes' : 'Cooking notes'}</span><p>${e(recipe.pitNotes)}</p></aside>` : ''}<aside class="collection-list"><span class="eyebrow">Filed under</span>${recipe.collections.filter(name => name !== "Jay's Pit House").map(name => `<a href="#/collections/${encodeURIComponent(name)}">${e(name)}</a>`).join('')}</aside></div><section class="notes-history"><div><span class="eyebrow">Family notes</span><h2>What we learned</h2>${recipe.notes.length ? `<ul>${recipe.notes.map(note => `<li>${e(note)}</li>`).join('')}</ul>` : '<p>No notes yet. Add the tiny changes that make this recipe yours.</p>'}<form data-form="note" data-id="${e(recipe.id)}"><input name="note" required maxlength="500" placeholder="e.g. Kids liked ½ tsp cayenne better"><button class="button ghost" type="submit">Add note</button></form></div><div><span class="eyebrow">Recipe history</span><h2>Changes over time</h2><ol class="history-list">${[...recipe.history].reverse().slice(0, 8).map(item => `<li><strong>${e(item.summary)}</strong><span>${fmtDate(item.at)}${item.by ? ` · ${e(item.by)}` : ''}</span></li>`).join('')}</ol></div></section></section>
  `, `detail-page ${pit ? 'pit-detail' : 'family-detail'}`, theme);
};

const collectionsPage = (selected?: string) => {
  const familyRecipes = state.recipes.filter(recipe => !isPitRecipe(recipe));
  if (selected) {
    const name = decodeURIComponent(selected);
    const recipes = familyRecipes.filter(recipe => recipe.collections.includes(name));
    return page(`<section><a class="text-link" href="#/collections">${icon('back')} Collections</a><span class="eyebrow">Collection</span><h1>${e(name)}</h1><p class="page-intro">${recipes.length} recipe${recipes.length === 1 ? '' : 's'} in this family shelf.</p>${recipes.length ? `<div class="recipe-grid">${recipes.map(recipeCard).join('')}</div>` : '<div class="empty-state"><h2>This collection is empty.</h2><p>Smoker recipes live separately in Jay’s Pit House.</p><a class="button ghost" href="#/pit-house">Open Pit House</a></div>'}</section>`);
  }
  const map = new Map<string, Recipe[]>();
  familyRecipes.forEach(recipe => recipe.collections.forEach(name => map.set(name, [...(map.get(name) ?? []), recipe])));
  return page(`<section><span class="eyebrow">Every family shelf</span><h1>Collections</h1><p class="page-intro">Dinner, desserts, family favorites, handed-down recipes, and whatever other shelves make sense for your family.</p>${map.size ? `<div class="collection-grid large">${[...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, recipes]) => collectionCard(name, recipes)).join('')}</div>` : '<div class="empty-state"><h2>No collections yet.</h2></div>'}</section>`);
};

const parseSections = (value: string, kind: 'ingredients' | 'directions'): IngredientSection[] | DirectionSection[] => {
  const sections: { title: string; lines: string[] }[] = [];
  let current = { title: kind === 'ingredients' ? 'Ingredients' : 'Directions', lines: [] as string[] };
  value.split('\n').map(line => line.trim()).forEach(line => {
    if (!line) return;
    const heading = line.match(/^\[(.+)]$/);
    if (heading) { if (current.lines.length) sections.push(current); current = { title: heading[1] ?? 'Section', lines: [] }; }
    else current.lines.push(line.replace(/^\d+[.)]\s*/, '').replace(/^[-•]\s*/, ''));
  });
  if (current.lines.length) sections.push(current);
  if (kind === 'ingredients') return sections.map((section, s) => ({ id: uid(`is-${s}`), title: section.title, ingredients: section.lines.map((raw, i) => ({ id: uid(`i-${i}`), raw, name: raw.replace(/^[\d¼½¾⅓⅔⅛⅜⅝⅞\s/.-]+/, '').replace(/,.*$/, '').trim() || raw })) }));
  return sections.map((section, s) => ({ id: uid(`ds-${s}`), title: section.title, steps: section.lines.map((text, i) => ({ id: uid(`d-${i}`), text })) }));
};

const sectionsToText = (recipe: Recipe, kind: 'ingredients' | 'directions') => (kind === 'ingredients' ? recipe.ingredientSections : recipe.directionSections).map(section => `[${section.title}]\n${kind === 'ingredients' ? (section as IngredientSection).ingredients.map(item => item.raw).join('\n') : (section as DirectionSection).steps.map((step, i) => `${i + 1}. ${step.text}`).join('\n')}`).join('\n\n');

const editor = (recipe?: Recipe) => page(`
  <section class="editor-page"><a class="text-link" href="${recipe ? `#/recipe/${e(recipe.id)}` : '#/'}">${icon('back')} Cancel</a><span class="eyebrow">${recipe ? 'Make it better' : 'Save something worth keeping'}</span><h1>${recipe ? `Edit ${e(recipe.title)}` : 'Add a family recipe'}</h1><p class="page-intro">Start with the food. The extra details can stay out of the way until you need them.</p>
  <form id="recipe-form" data-id="${e(recipe?.id ?? '')}" class="editor-form">
    <div class="field full"><label for="title">Recipe name</label><input id="title" name="title" required maxlength="120" value="${e(recipe?.title ?? '')}" placeholder="Mom’s pot roast"></div>
    <div class="field"><label for="category">Category</label><input id="category" name="category" value="${e(recipe?.category ?? 'Family recipes')}" placeholder="Dinner"></div>
    <div class="field"><label for="author">From</label><input id="author" name="author" value="${e(recipe?.author ?? '')}" placeholder="Grandma Jean"></div>
    <div class="field full"><label for="story">The story <small>Optional, but this is the part nobody else can preserve.</small></label><textarea id="story" name="story" rows="4" placeholder="She made this every Christmas Eve…">${e(recipe?.story ?? '')}</textarea></div>
    <div class="field"><label for="servings">Servings</label><input id="servings" name="servings" type="number" min="1" max="100" value="${e(recipe?.servings ?? 4)}"></div>
    <div class="field"><label for="prep">Prep minutes</label><input id="prep" name="prep" type="number" min="0" value="${e(recipe?.prepMinutes ?? '')}"></div>
    <div class="field full"><label for="image">Recipe image path</label><input id="image" name="image" value="${e(recipe?.image ?? '')}" placeholder="/recipe-images/my-recipe.webp"><small>Use an existing image in /recipe-images or leave blank.</small></div>
    <div class="field full"><label for="ingredients">Ingredients <small>One per line. Use [Section name] for groups.</small></label><textarea id="ingredients" name="ingredients" rows="14" required placeholder="[Chicken]\n2 lb chicken thighs\n1 tsp salt">${e(recipe ? sectionsToText(recipe, 'ingredients') : '')}</textarea></div>
    <div class="field full"><label for="directions">Directions <small>One step per line. Use [Section name] for stages.</small></label><textarea id="directions" name="directions" rows="14" required placeholder="[Cook]\nPreheat the smoker…">${e(recipe ? sectionsToText(recipe, 'directions') : '')}</textarea></div>
    <details class="advanced full" ${recipe?.smoker ? 'open' : ''}><summary>Cooking details & smoker profile</summary><div class="advanced-grid">
      <div class="field"><label>Pit temperature °F</label><input name="pitTemperatureF" type="number" value="${e(recipe?.smoker?.pitTemperatureF ?? '')}"></div><div class="field"><label>Target internal</label><input name="targetInternalF" value="${e(recipe?.smoker?.targetInternalF ?? '')}" placeholder="175–180°F"></div><div class="field"><label>Wood</label><input name="wood" value="${e(recipe?.smoker?.wood ?? '')}" placeholder="White oak + apple"></div><div class="field"><label>Smoke</label><input name="smoke" value="${e(recipe?.smoker?.smoke ?? '')}" placeholder="Thin blue smoke"></div>
      <div class="field full"><label>Collections <small>Comma separated</small></label><input name="collections" value="${e(recipe?.collections.join(', ') ?? '')}" placeholder="Summer, Family Favorites"></div><div class="field full"><label>Tags <small>Comma separated</small></label><input name="tags" value="${e(recipe?.tags.join(', ') ?? '')}" placeholder="chicken, quick, smoker"></div><div class="field full"><label>Pit / cooking notes</label><textarea name="pitNotes" rows="4">${e(recipe?.pitNotes ?? '')}</textarea></div>
    </div></details>
    <div class="form-actions full"><button class="button primary" type="submit">${recipe ? 'Save changes' : 'Add to cookbook'}</button>${recipe ? `<button class="button danger" type="button" data-action="delete-recipe" data-id="${e(recipe.id)}">Delete recipe</button>` : ''}</div>
  </form></section>
`, 'editor-shell', recipe && isPitRecipe(recipe) ? 'pit' : 'family');

const importPage = () => page(`
  <section class="import-page"><a class="text-link" href="#/">${icon('back')} Home</a><span class="eyebrow">Bring recipes home</span><h1>Import a Family Cookbook Package</h1><p class="page-intro">Preview everything first. Nothing is written to your cookbook until you approve it.</p>
  <div class="drop-zone" id="drop-zone"><span class="drop-icon">${icon('import')}</span><h2>Drop a .fcp file here</h2><p>or choose one from Files</p><label class="button primary" for="fcp-file">Choose .fcp file</label><input id="fcp-file" type="file" accept=".fcp,application/json" hidden></div>
  ${importPreview ? `<section class="import-preview"><div class="section-heading"><div><span class="eyebrow">Ready to review</span><h2>${e(importPreview.packageName || 'Cookbook package')}</h2></div><span>${importPreview.recipes.length} recipe${importPreview.recipes.length === 1 ? '' : 's'}</span></div>${importPreview.duplicateIds.length ? `<div class="warning"><strong>${importPreview.duplicateIds.length} possible duplicate${importPreview.duplicateIds.length === 1 ? '' : 's'}</strong><p>Matching titles will be updated rather than duplicated.</p></div>` : ''}${importPreview.warnings.length ? `<div class="warning subtle"><strong>Review these details</strong><ul>${importPreview.warnings.map(item => `<li>${e(item)}</li>`).join('')}</ul></div>` : ''}<div class="preview-list">${importPreview.recipes.map(recipe => `<article>${recipe.image ? `<img src="${e(recipe.image)}" alt="">` : ''}<div><span class="eyebrow">${e(recipe.category)}</span><h3>${e(recipe.title)}</h3><p>${recipe.ingredientSections.flatMap(s => s.ingredients).length} ingredients · ${flatSteps(recipe).length} steps${recipe.smoker ? ' · smoker profile' : ''}</p></div></article>`).join('')}</div><div class="form-actions"><button class="button primary" data-action="commit-import">Add to cookbook</button><button class="button ghost" data-action="clear-import">Choose another file</button></div></section>` : ''}
  <aside class="format-note"><strong>Compatible with your existing packages.</strong><p>Family Cookbook Package versions 1 and 2 are supported, with a 10 MB / 100 recipe safety limit.</p></aside></section>
`);

const groceryPage = () => page(`<section><span class="eyebrow">One trip, less chaos</span><h1>Grocery list</h1><p class="page-intro">Add ingredients from any recipe. Items from multiple recipes stay grouped in one list.</p>${state.grocery.length ? `<div class="grocery-list">${state.grocery.map(item => `<label class="grocery-item ${item.checked ? 'checked' : ''}"><input type="checkbox" data-action="grocery-check" data-id="${e(item.id)}" ${item.checked ? 'checked' : ''}><span>${e(item.name)}</span><small>${item.recipeIds.length} recipe${item.recipeIds.length === 1 ? '' : 's'}</small></label>`).join('')}</div><div class="form-actions"><button class="button ghost" data-action="clear-checked">Clear checked</button><button class="button danger" data-action="clear-grocery">Clear list</button></div>` : `<div class="empty-state"><h2>Your list is empty.</h2><p>Open a recipe and tap “Add ingredients to grocery list.”</p><a class="button primary" href="#/">Browse recipes</a></div>`}</section>`);

const ingredientsForStep = (recipe: Recipe, stepText: string) => {
  const lower = stepText.toLowerCase();
  return recipe.ingredientSections.flatMap(section => section.ingredients).filter(item => {
    const words = item.name.toLowerCase().split(/\s+/).filter(word => word.length >= 4);
    return words.some(word => lower.includes(word));
  }).slice(0, 8);
};
const minutesInStep = (text: string) => [...text.matchAll(/(\d+)\s*(?:–|-|to)?\s*(\d+)?\s*minutes?/gi)].map(match => Number(match[2] ?? match[1])).filter(value => value > 0 && value <= 240);

const cookMode = (recipe: Recipe) => {
  const steps = flatSteps(recipe);
  const saved = loadCookProgress();
  const stepIndex = saved?.recipeId === recipe.id ? Math.min(saved.stepIndex, steps.length - 1) : 0;
  const current = steps[stepIndex];
  if (!current) return page('<div class="empty-state"><h1>No directions yet.</h1></div>');
  if (!saved || saved.recipeId !== recipe.id) saveCookProgress({ recipeId: recipe.id, stepIndex, startedAt: Date.now(), updatedAt: Date.now() });
  const relevant = ingredientsForStep(recipe, current.step.text);
  const timers = minutesInStep(current.step.text);
  return `<main class="cook-mode">
    <header><a href="#/recipe/${e(recipe.id)}" aria-label="Exit cook mode">×</a><div><span>${e(recipe.title)}</span><strong>Step ${stepIndex + 1} of ${steps.length}</strong></div><button data-action="finish-cook" data-id="${e(recipe.id)}">Finish</button></header>
    <div class="cook-progress"><span style="width:${((stepIndex + 1) / steps.length) * 100}%"></span></div>
    <section class="cook-stage"><div class="cook-section">${e(current.section)}</div><div class="cook-step-number">${String(stepIndex + 1).padStart(2, '0')}</div><p>${e(current.step.text)}</p>
      ${timers.length ? `<div class="timer-actions">${timers.map(minutes => `<button class="timer-button" data-action="start-timer" data-minutes="${minutes}" data-label="${e(`${recipe.title} · step ${stepIndex + 1}`)}">${icon('clock')} Start ${minutes} min timer</button>`).join('')}</div>` : ''}
      ${relevant.length ? `<aside class="step-ingredients"><span class="eyebrow">Ingredients in this step</span>${relevant.map(item => `<span>${e(item.raw)}</span>`).join('')}</aside>` : ''}
      ${recipe.smoker && (stepIndex === 0 || /smok|temperature|internal|pit/i.test(current.step.text)) ? `<aside class="cook-smoke"><strong>${icon('smoker')} Pit check</strong><span>${recipe.smoker.pitTemperatureF ? `${recipe.smoker.pitTemperatureF}°F` : ''}${recipe.smoker.targetInternalF ? ` · pull at ${e(recipe.smoker.targetInternalF)}` : ''}</span><small>${e(recipe.smoker.smoke ?? '')}</small></aside>` : ''}
    </section>
    <footer><button class="button ghost" data-action="cook-step" data-delta="-1" data-id="${e(recipe.id)}" ${stepIndex === 0 ? 'disabled' : ''}>${icon('back')} Previous</button><button class="button primary" data-action="cook-step" data-delta="1" data-id="${e(recipe.id)}">${stepIndex === steps.length - 1 ? 'Finish cooking' : 'Next step →'}</button></footer>
  </main>`;
};

const render = () => {
  const [section, id] = route();
  const recipe = ['recipe', 'edit', 'cook'].includes(section ?? '') ? findRecipe(id) : undefined;
  const theme: Theme = section === 'pit-house' || (recipe && isPitRecipe(recipe)) ? 'pit' : 'family';
  setTheme(theme);
  if (section === 'recipe') root.innerHTML = recipe ? recipeDetail(recipe) : page('<div class="empty-state"><h1>Recipe not found.</h1><a class="button primary" href="#/">Back home</a></div>');
  else if (section === 'edit') root.innerHTML = recipe ? editor(recipe) : page('<div class="empty-state"><h1>Recipe not found.</h1></div>');
  else if (section === 'new') root.innerHTML = editor();
  else if (section === 'pit-house') root.innerHTML = pitHouse();
  else if (section === 'collections') root.innerHTML = collectionsPage(id);
  else if (section === 'import') root.innerHTML = importPage();
  else if (section === 'grocery') root.innerHTML = groceryPage();
  else if (section === 'cook') root.innerHTML = recipe ? cookMode(recipe) : page('<div class="empty-state"><h1>Recipe not found.</h1></div>', '', theme);
  else root.innerHTML = home();
  updateTimerDisplays();
};

const saveRecipeForm = (form: HTMLFormElement) => {
  const data = new FormData(form);
  const title = String(data.get('title') ?? '').trim();
  const ingredientSections = parseSections(String(data.get('ingredients') ?? ''), 'ingredients') as IngredientSection[];
  const directionSections = parseSections(String(data.get('directions') ?? ''), 'directions') as DirectionSection[];
  if (!title || !ingredientSections.length || !directionSections.length) return toast('Recipe name, ingredients, and directions are required.');
  const existing = findRecipe(form.dataset.id);
  const now = Date.now();
  const collections = String(data.get('collections') ?? '').split(',').map(v => v.trim()).filter(Boolean);
  const tags = String(data.get('tags') ?? '').split(',').map(v => v.trim()).filter(Boolean);
  const pit = Number(data.get('pitTemperatureF')) || undefined;
  const target = String(data.get('targetInternalF') ?? '').trim();
  const wood = String(data.get('wood') ?? '').trim();
  const smoke = String(data.get('smoke') ?? '').trim();
  const smoker = pit || target || wood || smoke ? { pitTemperatureF: pit, targetInternalF: target || undefined, wood: wood || undefined, smoke: smoke || undefined } : undefined;
  const recipe: Recipe = {
    id: existing?.id ?? uid('recipe'), title, category: String(data.get('category') ?? '').trim() || 'Family recipes', author: String(data.get('author') ?? '').trim() || undefined, addedBy: existing?.addedBy ?? 'Family', story: String(data.get('story') ?? '').trim() || undefined,
    image: String(data.get('image') ?? '').trim() || undefined, servings: Math.max(1, Number(data.get('servings')) || 4), prepMinutes: Number(data.get('prep')) || undefined, tags, collections: collections.length ? collections : [String(data.get('category') ?? '').trim() || 'Family recipes'], ingredientSections, directionSections, smoker,
    pitNotes: String(data.get('pitNotes') ?? '').trim() || undefined, notes: existing?.notes ?? [], favorite: existing?.favorite ?? false, createdAt: existing?.createdAt ?? now, updatedAt: now, lastCookedAt: existing?.lastCookedAt,
    history: [...(existing?.history ?? []), { id: uid('history'), at: now, summary: existing ? 'Recipe edited' : 'Recipe added to the family cookbook', by: 'Family' }]
  };
  if (existing) state.recipes = state.recipes.map(item => item.id === existing.id ? recipe : item); else state.recipes.unshift(recipe);
  persist(); go(`recipe/${recipe.id}`); setTimeout(() => toast(existing ? 'Recipe updated.' : 'Recipe added.'), 50);
};

const mergeImported = () => {
  if (!importPreview) return;
  importPreview.recipes.forEach(recipe => {
    const existing = state.recipes.find(item => item.title.toLowerCase() === recipe.title.toLowerCase());
    if (existing) state.recipes = state.recipes.map(item => item.id === existing.id ? { ...recipe, id: existing.id, createdAt: existing.createdAt, history: [...existing.history, { id: uid('history'), at: Date.now(), summary: 'Updated from .fcp package' }] } : item);
    else state.recipes.unshift(recipe);
  });
  persist(); const count = importPreview.recipes.length; importPreview = null; go(''); setTimeout(() => toast(`Imported ${count} recipe${count === 1 ? '' : 's'}.`), 60);
};

const handleFile = async (file: File) => {
  try { importPreview = await previewFcp(file, state.recipes); render(); } catch (error) { toast(error instanceof Error ? error.message : 'Could not read that package.'); }
};

const updateTimerDisplays = () => {
  const now = Date.now();
  const timers = getTimers();
  let changed = false;
  document.querySelectorAll<HTMLElement>('[data-timer-end]').forEach(node => {
    const remaining = Math.max(0, Number(node.dataset.timerEnd) - now);
    const b = node.querySelector('b');
    if (b) b.textContent = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;
  });
  Object.entries(timers).forEach(([key, timer]) => {
    if (timer.endsAt <= now) { delete timers[key]; changed = true; setTimeout(() => window.alert(`Timer finished: ${timer.label}`), 0); }
  });
  if (changed) setTimers(timers);
};

root.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'favorite') { const recipe = findRecipe(target.dataset.id); if (recipe) { recipe.favorite = !recipe.favorite; recipe.updatedAt = Date.now(); persist(); render(); } }
  if (action === 'servings') { const recipe = findRecipe(target.dataset.id); if (recipe) { const current = servingsByRecipe.get(recipe.id) ?? recipe.servings; servingsByRecipe.set(recipe.id, Math.max(1, current + Number(target.dataset.delta ?? 0))); render(); } }
  if (action === 'ingredient-check') { const id = target.dataset.ingredient; if (id) { if ((target as HTMLInputElement).checked) checkedIngredients.add(id); else checkedIngredients.delete(id); target.closest('.ingredient')?.classList.toggle('checked', (target as HTMLInputElement).checked); } }
  if (action === 'add-grocery') { const recipe = findRecipe(target.dataset.id); if (recipe) { const additions = groceryFromRecipes([recipe]); additions.forEach(addition => { if (!state.grocery.some(item => item.name.toLowerCase() === addition.name.toLowerCase())) state.grocery.push(addition); }); persist(); toast('Ingredients added to grocery list.'); } }
  if (action === 'grocery-check') { const item = state.grocery.find(g => g.id === target.dataset.id); if (item) { item.checked = (target as HTMLInputElement).checked; persist(); render(); } }
  if (action === 'clear-checked') { state.grocery = state.grocery.filter(item => !item.checked); persist(); render(); }
  if (action === 'clear-grocery') { if (confirm('Clear the whole grocery list?')) { state.grocery = []; persist(); render(); } }
  if (action === 'commit-import') mergeImported();
  if (action === 'clear-import') { importPreview = null; render(); }
  if (action === 'delete-recipe') { const recipe = findRecipe(target.dataset.id); if (recipe && confirm(`Delete “${recipe.title}”? This cannot be undone.`)) { state.recipes = state.recipes.filter(item => item.id !== recipe.id); persist(); go(''); } }
  if (action === 'cook-step') {
    const recipe = findRecipe(target.dataset.id); if (!recipe) return;
    const steps = flatSteps(recipe); const progress = loadCookProgress(); const current = progress?.recipeId === recipe.id ? progress.stepIndex : 0; const next = current + Number(target.dataset.delta ?? 0);
    if (next >= steps.length) { recipe.lastCookedAt = Date.now(); recipe.history.push({ id: uid('history'), at: Date.now(), summary: 'Cooked this recipe' }); persist(); saveCookProgress(null); go(`recipe/${recipe.id}`); return; }
    saveCookProgress({ recipeId: recipe.id, stepIndex: Math.max(0, next), startedAt: progress?.startedAt ?? Date.now(), updatedAt: Date.now() }); render();
  }
  if (action === 'finish-cook') { const recipe = findRecipe(target.dataset.id); if (recipe) { recipe.lastCookedAt = Date.now(); recipe.history.push({ id: uid('history'), at: Date.now(), summary: 'Cooked this recipe' }); persist(); saveCookProgress(null); go(`recipe/${recipe.id}`); } }
  if (action === 'start-timer') { const minutes = Number(target.dataset.minutes); if (minutes > 0) { const timers = getTimers(); const key = uid('timer'); timers[key] = { label: target.dataset.label ?? 'Cook timer', endsAt: Date.now() + minutes * 60000 }; setTimers(timers); toast(`${minutes} minute timer started.`); } }
});

root.addEventListener('submit', event => {
  const form = event.target as HTMLFormElement;
  if (form.id === 'search-form') { event.preventDefault(); const data = new FormData(form); const query = String(data.get('q') ?? '').trim(); const scope = form.dataset.scope === 'pit' ? 'pit' : 'family'; location.hash = query ? (scope === 'pit' ? `#/pit-house?q=${encodeURIComponent(query)}` : `#/?q=${encodeURIComponent(query)}`) : (scope === 'pit' ? '#/pit-house' : '#/'); }
  if (form.id === 'recipe-form') { event.preventDefault(); saveRecipeForm(form); }
  if (form.dataset.form === 'note') { event.preventDefault(); const recipe = findRecipe(form.dataset.id); const data = new FormData(form); const note = String(data.get('note') ?? '').trim(); if (recipe && note) { recipe.notes.push(note); recipe.history.push({ id: uid('history'), at: Date.now(), summary: 'Family note added' }); recipe.updatedAt = Date.now(); persist(); render(); toast('Note saved.'); } }
});

root.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'fcp-file' && input.files?.[0]) void handleFile(input.files[0]);
});
root.addEventListener('dragover', event => { if ((event.target as HTMLElement).closest('#drop-zone')) { event.preventDefault(); (event.target as HTMLElement).closest('#drop-zone')?.classList.add('dragging'); } });
root.addEventListener('dragleave', event => (event.target as HTMLElement).closest('#drop-zone')?.classList.remove('dragging'));
root.addEventListener('drop', event => { const zone = (event.target as HTMLElement).closest('#drop-zone'); if (!zone) return; event.preventDefault(); zone.classList.remove('dragging'); const file = (event as DragEvent).dataTransfer?.files[0]; if (file) void handleFile(file); });

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
window.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) { event.preventDefault(); go(''); setTimeout(() => document.querySelector<HTMLInputElement>('#recipe-search')?.focus(), 50); }
  if (route()[0] === 'cook' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { const button = document.querySelector<HTMLButtonElement>(`[data-action="cook-step"][data-delta="${event.key === 'ArrowRight' ? '1' : '-1'}"]`); button?.click(); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
setInterval(updateTimerDisplays, 1000);
render();
void migrateBundledLegacyCatalog(state).then(added => {
  if (!added) return;
  persist();
  render();
  setTimeout(() => toast(`Brought ${added} original recipe${added === 1 ? '' : 's'} into the new cookbook.`), 80);
}).catch(error => console.warn('Legacy catalog migration will retry on the next load.', error));
