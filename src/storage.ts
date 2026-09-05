import { seedRecipes } from './data.js';
import type { CookbookState, CookProgress, Recipe } from './types.js';

const STATE_KEY = 'family-cookbook:v2';
const LEGACY_USER_KEY = 'family-cookbook:user-recipes:v1';
const COOK_KEY = 'family-cookbook:cook-progress:v1';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const id = () => `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const legacyToRecipe = (raw: Record<string, unknown>, index: number): Recipe | null => {
  const title = String(raw.title ?? '').trim();
  if (!title) return null;
  const createdAt = Number(raw.createdAt) || Date.now() - index;
  const ingredientSectionsRaw = Array.isArray(raw.ingredientSections) ? raw.ingredientSections : null;
  const directionSectionsRaw = Array.isArray(raw.directionSections) ? raw.directionSections : null;
  const flatIngredients = Array.isArray(raw.ingredients) ? raw.ingredients.map(String) : [];
  const flatDirections = Array.isArray(raw.directions) ? raw.directions.map(String) : [];
  const ingredientSections = (ingredientSectionsRaw?.length ? ingredientSectionsRaw : [{ title: 'Ingredients', items: flatIngredients }]).map((section, s) => {
    const value = section as Record<string, unknown>;
    const items = Array.isArray(value.items) ? value.items.map(String) : [];
    return {
      id: `${id()}-is-${s}`,
      title: String(value.title ?? 'Ingredients'),
      ingredients: items.map((text, i) => ({ id: `${id()}-i-${i}`, raw: text, name: text.replace(/^[\d¼½¾⅓⅔⅛⅜⅝⅞\s/.-]+/, '').trim() || text }))
    };
  });
  const directionSections = (directionSectionsRaw?.length ? directionSectionsRaw : [{ title: 'Directions', steps: flatDirections }]).map((section, s) => {
    const value = section as Record<string, unknown>;
    const steps = Array.isArray(value.steps) ? value.steps.map(String) : [];
    return { id: `${id()}-ds-${s}`, title: String(value.title ?? 'Directions'), steps: steps.map((text, i) => ({ id: `${id()}-d-${i}`, text })) };
  });
  const meta = (raw.meta && typeof raw.meta === 'object' ? raw.meta : {}) as Record<string, unknown>;
  const smokerRaw = (raw.smoker && typeof raw.smoker === 'object' ? raw.smoker : undefined) as Record<string, unknown> | undefined;
  const smoker = smokerRaw ? {
    pitTemperatureF: Number(smokerRaw.temperatureF) || undefined,
    wood: String(smokerRaw.wood ?? '') || undefined,
    smoke: String(smokerRaw.smoke ?? '') || undefined,
    targetInternalF: String(smokerRaw.targetInternalF ?? '') || undefined,
    time: String(smokerRaw.time ?? '') || undefined,
    finish: String(smokerRaw.finish ?? '') || undefined
  } : undefined;
  return {
    id: String(raw.id ?? id()),
    title,
    category: String(raw.category ?? 'Family recipes'),
    image: String(raw.image ?? '') || undefined,
    servings: Number(String(meta.yield ?? '').match(/\d+/)?.[0] ?? 0) || 4,
    prepMinutes: Number(meta.prepMinutes) || undefined,
    cookMinutes: Number(meta.cookMinutes) || undefined,
    cookLabel: String(meta.cookLabel ?? '') || undefined,
    marinate: String(meta.marinate ?? '') || undefined,
    tags: [],
    collections: [String(raw.category ?? 'Family recipes')],
    ingredientSections,
    directionSections,
    smoker,
    pitNotes: String(raw.pitNotes ?? '') || undefined,
    note: String(raw.note ?? '') || undefined,
    notes: [],
    history: [{ id: `${id()}-migration`, at: Date.now(), summary: 'Migrated from Family Cookbook v1' }],
    favorite: false,
    createdAt,
    updatedAt: createdAt
  };
};

export const loadState = (): CookbookState => {
  try {
    const stored = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as CookbookState | null;
    if (stored?.version === 2 && Array.isArray(stored.recipes)) return stored;
  } catch { /* recover below */ }

  const recipes = clone(seedRecipes);
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_USER_KEY) ?? '[]') as unknown;
    if (Array.isArray(legacy)) {
      legacy.forEach((value, index) => {
        if (!value || typeof value !== 'object') return;
        const migrated = legacyToRecipe(value as Record<string, unknown>, index);
        if (migrated && !recipes.some(recipe => recipe.title.toLowerCase() === migrated.title.toLowerCase())) recipes.unshift(migrated);
      });
    }
  } catch { /* ignore malformed legacy data */ }

  const state: CookbookState = { version: 2, recipes, grocery: [] };
  saveState(state);
  return state;
};

export const saveState = (state: CookbookState) => localStorage.setItem(STATE_KEY, JSON.stringify(state));

export const saveCookProgress = (progress: CookProgress | null) => {
  if (!progress) localStorage.removeItem(COOK_KEY);
  else localStorage.setItem(COOK_KEY, JSON.stringify(progress));
};

export const loadCookProgress = (): CookProgress | null => {
  try {
    const progress = JSON.parse(localStorage.getItem(COOK_KEY) ?? 'null') as CookProgress | null;
    return progress?.recipeId ? progress : null;
  } catch { return null; }
};
