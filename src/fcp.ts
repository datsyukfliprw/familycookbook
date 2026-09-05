import type { ImportPreview, Recipe } from './types.js';

const PACKAGE_FORMAT = 'family-cookbook-package';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_RECIPES = 100;
const text = (value: unknown, max = 5000) => String(value ?? '').trim().slice(0, max);
const number = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : undefined; };
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const rawIngredientName = (raw: string) => raw.replace(/^[\d¼½¾⅓⅔⅛⅜⅝⅞\s/.-]+/, '').replace(/,.*$/, '').trim() || raw;

export const recipeFromPackage = (raw: Record<string, unknown>, index: number): Recipe => {
  const title = text(raw.title, 120);
  if (!title) throw new Error(`Recipe ${index + 1} is missing a title.`);
  const ingredientSectionsRaw = Array.isArray(raw.ingredientSections) ? raw.ingredientSections : [];
  const directionSectionsRaw = Array.isArray(raw.directionSections) ? raw.directionSections : [];
  const ingredientsRaw = Array.isArray(raw.ingredients) ? raw.ingredients.map(item => text(item, 1000)).filter(Boolean) : [];
  const directionsRaw = Array.isArray(raw.directions) ? raw.directions.map(item => text(item, 1400)).filter(Boolean) : [];
  const ingredientSections = (ingredientSectionsRaw.length ? ingredientSectionsRaw : [{ title: 'Ingredients', items: ingredientsRaw }]).map((value, s) => {
    const section = value as Record<string, unknown>;
    const items = Array.isArray(section.items) ? section.items.map(item => text(item, 1000)).filter(Boolean) : [];
    return { id: uid(`is-${s}`), title: text(section.title, 80) || 'Ingredients', ingredients: items.map((rawText, i) => ({ id: uid(`i-${i}`), raw: rawText, name: rawIngredientName(rawText) })) };
  }).filter(section => section.ingredients.length);
  const directionSections = (directionSectionsRaw.length ? directionSectionsRaw : [{ title: 'Directions', steps: directionsRaw }]).map((value, s) => {
    const section = value as Record<string, unknown>;
    const steps = Array.isArray(section.steps) ? section.steps.map(item => text(item, 1400)).filter(Boolean) : [];
    return { id: uid(`ds-${s}`), title: text(section.title, 80) || 'Directions', steps: steps.map((stepText, i) => ({ id: uid(`d-${i}`), text: stepText })) };
  }).filter(section => section.steps.length);
  if (!ingredientSections.length || !directionSections.length) throw new Error(`Recipe ${index + 1} needs ingredients and directions.`);
  const meta = (raw.meta && typeof raw.meta === 'object' ? raw.meta : {}) as Record<string, unknown>;
  const smokerRaw = (raw.smoker && typeof raw.smoker === 'object' ? raw.smoker : undefined) as Record<string, unknown> | undefined;
  const createdAt = Date.now() - index;
  return {
    id: uid('recipe'), title, category: text(raw.category, 80) || 'Family recipes', image: /^\/recipe-images\/[a-z0-9._/-]+$/i.test(text(raw.image, 300)) ? text(raw.image, 300) : undefined,
    servings: Number(text(meta.yield, 60).match(/\d+/)?.[0] ?? 0) || 4, prepMinutes: number(meta.prepMinutes), cookMinutes: number(meta.cookMinutes), cookLabel: text(meta.cookLabel, 60) || undefined, marinate: text(meta.marinate, 60) || undefined,
    tags: [], collections: [text(raw.category, 80) || 'Family recipes'], ingredientSections, directionSections,
    smoker: smokerRaw ? { pitTemperatureF: number(smokerRaw.temperatureF), wood: text(smokerRaw.wood, 160) || undefined, smoke: text(smokerRaw.smoke, 160) || undefined, targetInternalF: text(smokerRaw.targetInternalF, 80) || undefined, time: text(smokerRaw.time, 80) || undefined, finish: text(smokerRaw.finish, 180) || undefined } : undefined,
    pitNotes: text(raw.pitNotes) || undefined, note: text(raw.note) || undefined, notes: [], history: [{ id: uid('history'), at: createdAt, summary: 'Imported from .fcp package' }], favorite: false, createdAt, updatedAt: createdAt
  };
};

export const previewFcp = async (file: File, existing: Recipe[]): Promise<ImportPreview> => {
  if (file.size > MAX_BYTES) throw new Error('That .fcp file is larger than 10 MB.');
  let data: unknown;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('That file is not valid JSON.'); }
  if (!data || typeof data !== 'object') throw new Error('Unrecognized cookbook package.');
  const pkg = data as Record<string, unknown>;
  if (pkg.format !== PACKAGE_FORMAT) throw new Error('Unrecognized cookbook package format.');
  if (![1, 2].includes(Number(pkg.version))) throw new Error(`Unsupported .fcp version: ${String(pkg.version)}.`);
  if (!Array.isArray(pkg.recipes) || !pkg.recipes.length) throw new Error('This package does not contain recipes.');
  if (pkg.recipes.length > MAX_RECIPES) throw new Error(`A package can contain at most ${MAX_RECIPES} recipes.`);
  const recipes = pkg.recipes.map((value, index) => recipeFromPackage(value as Record<string, unknown>, index));
  const warnings: string[] = [];
  recipes.forEach(recipe => {
    if (!recipe.prepMinutes) warnings.push(`${recipe.title}: prep time is missing.`);
    if (!recipe.image) warnings.push(`${recipe.title}: no local recipe image was provided.`);
  });
  const duplicateIds = recipes.flatMap(recipe => {
    const match = existing.find(item => item.title.trim().toLowerCase() === recipe.title.trim().toLowerCase());
    return match ? [match.id] : [];
  });
  return { packageName: text(pkg.name, 120), recipes, warnings, duplicateIds };
};
