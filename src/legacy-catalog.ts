import type { CookbookState, DirectionSection, IngredientSection, Recipe } from './types.js';

const MIGRATION_KEY = 'family-cookbook:bundled-catalog:v1';
const LEGACY_BUNDLE = '/assets/index-DN7Jouwl.js';
const KNOWN_RECIPE_TITLE = 'Apple Crisp Snack Mix';
const CATALOG_START = /\[\{id:(["'`])[^"'`]+\1,title:(["'`])[^"'`]+\2,category:(["'`])[^"'`]+\3,order:\d+,intro:\[/;

type LegacyMeta = {
  prepMinutes?: unknown;
  cookMinutes?: unknown;
  totalMinutes?: unknown;
  temperatureF?: unknown;
  yield?: unknown;
  cookLabel?: unknown;
  marinate?: unknown;
};
type LegacyIngredientSection = { title?: unknown; name?: unknown; items?: unknown[]; ingredients?: unknown[] };
type LegacyDirectionSection = { title?: unknown; name?: unknown; steps?: unknown[] };
type LegacyRecipe = {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  order?: unknown;
  intro?: unknown[];
  ingredients?: unknown[];
  directions?: unknown[];
  ingredientSections?: LegacyIngredientSection[];
  directionSections?: LegacyDirectionSection[];
  tips?: unknown[];
  note?: unknown;
  image?: unknown;
  meta?: LegacyMeta;
  smoker?: Record<string, unknown>;
};

const text = (value: unknown) => String(value ?? '').trim();
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = text(value).match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
};
const looksLikeHeading = (value: string) => value.length > 0 && value.length <= 46 && !/\d/.test(value) && value === value.toUpperCase() && /[A-Z]/.test(value);
const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s/&-])\w/g, match => match.toUpperCase());

const extractCatalogLiteral = (source: string): string => {
  const match = CATALOG_START.exec(source);
  const start = match?.index ?? -1;
  if (start < 0) throw new Error('Legacy recipe catalog start was not found.');

  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i] ?? '';
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Legacy recipe catalog end was not found.');
};

const normalizeIngredientSections = (legacy: LegacyRecipe, id: string): IngredientSection[] => {
  if (Array.isArray(legacy.ingredientSections) && legacy.ingredientSections.length) {
    return legacy.ingredientSections.map((section, sectionIndex) => {
      const items = Array.isArray(section.items) ? section.items : Array.isArray(section.ingredients) ? section.ingredients : [];
      return {
        id: `${id}-ingredients-${sectionIndex}`,
        title: text(section.title ?? section.name) || 'Ingredients',
        ingredients: items.map((item, itemIndex) => {
          const raw = typeof item === 'object' && item !== null && 'raw' in item ? text((item as { raw?: unknown }).raw) : text(item);
          const name = typeof item === 'object' && item !== null && 'name' in item ? text((item as { name?: unknown }).name) : raw;
          return { id: `${id}-ingredient-${sectionIndex}-${itemIndex}`, raw, name: name || raw };
        }).filter(item => item.raw)
      };
    }).filter(section => section.ingredients.length);
  }

  const flat = Array.isArray(legacy.ingredients) ? legacy.ingredients.map(text).filter(Boolean) : [];
  const groups: { title: string; items: string[] }[] = [];
  let current = { title: 'Ingredients', items: [] as string[] };
  for (const raw of flat) {
    if (looksLikeHeading(raw)) {
      if (current.items.length) groups.push(current);
      current = { title: titleCase(raw), items: [] };
    } else current.items.push(raw);
  }
  if (current.items.length) groups.push(current);
  if (!groups.length && flat.length) groups.push({ title: 'Ingredients', items: flat });
  return groups.map((group, sectionIndex) => ({
    id: `${id}-ingredients-${sectionIndex}`,
    title: group.title,
    ingredients: group.items.map((raw, itemIndex) => ({ id: `${id}-ingredient-${sectionIndex}-${itemIndex}`, raw, name: raw }))
  }));
};

const normalizeDirectionSections = (legacy: LegacyRecipe, id: string): DirectionSection[] => {
  if (Array.isArray(legacy.directionSections) && legacy.directionSections.length) {
    return legacy.directionSections.map((section, sectionIndex) => ({
      id: `${id}-directions-${sectionIndex}`,
      title: text(section.title ?? section.name) || 'Directions',
      steps: (Array.isArray(section.steps) ? section.steps : []).map((step, stepIndex) => ({
        id: `${id}-step-${sectionIndex}-${stepIndex}`,
        text: typeof step === 'object' && step !== null && 'text' in step ? text((step as { text?: unknown }).text) : text(step)
      })).filter(step => step.text)
    })).filter(section => section.steps.length);
  }

  const steps = Array.isArray(legacy.directions) ? legacy.directions.map((step, stepIndex) => ({
    id: `${id}-step-${stepIndex}`,
    text: typeof step === 'object' && step !== null && 'text' in step ? text((step as { text?: unknown }).text) : text(step)
  })).filter(step => step.text) : [];
  return steps.length ? [{ id: `${id}-directions`, title: 'Directions', steps }] : [];
};

const noteList = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value) ? [text(value)] : [];

const convertRecipe = (legacy: LegacyRecipe, index: number): Recipe | null => {
  const title = text(legacy.title);
  if (!title) return null;
  const id = text(legacy.id) || `legacy-${slug(title)}-${index}`;
  const category = text(legacy.category) || 'Family recipes';
  const ingredientSections = normalizeIngredientSections(legacy, id);
  const directionSections = normalizeDirectionSections(legacy, id);
  const directionText = directionSections.flatMap(section => section.steps.map(step => step.text)).join(' ');
  const isSmoker = /smok|bbq|barbecue/i.test(category) || /\b(smok(?:e|ed|ing|er)|bbq|barbecue)\b/i.test(`${title} ${directionText}`) || Boolean(legacy.smoker);
  const meta = legacy.meta ?? {};
  const order = numberValue(legacy.order) ?? index;
  const createdAt = Date.UTC(2026, 0, 1) + order * 1000;
  const intro = Array.isArray(legacy.intro) ? legacy.intro.map(text).filter(Boolean) : [];
  const tips = noteList(legacy.tips).map(tip => `Tip: ${tip}`);
  const notes = [...noteList(legacy.note), ...tips];
  const servings = Math.max(1, Math.round(numberValue(meta.yield) ?? 4));
  const prepMinutes = numberValue(meta.prepMinutes);
  const cookMinutes = numberValue(meta.cookMinutes);
  const pitTemperatureF = isSmoker ? numberValue(meta.temperatureF) : undefined;
  const smoker = isSmoker ? {
    pitTemperatureF,
    time: text(meta.cookLabel) || (cookMinutes ? `${cookMinutes} min` : undefined)
  } : undefined;

  return {
    id,
    title,
    description: intro[0] || undefined,
    story: intro.length ? intro.join('\n\n') : undefined,
    category,
    image: text(legacy.image) || undefined,
    servings,
    prepMinutes,
    cookMinutes,
    cookLabel: text(meta.cookLabel) || undefined,
    tags: isSmoker ? ['smoker'] : [],
    collections: isSmoker ? ["Jay's Pit House", category] : [category],
    ingredientSections,
    directionSections,
    smoker,
    notes,
    history: [{ id: `${id}-legacy-migration`, at: createdAt, summary: 'Migrated from the original Family Cookbook' }],
    favorite: false,
    createdAt,
    updatedAt: createdAt
  };
};

export const migrateBundledLegacyCatalog = async (state: CookbookState): Promise<number> => {
  if (localStorage.getItem(MIGRATION_KEY) === 'done') return 0;
  const response = await fetch(LEGACY_BUNDLE, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Could not load the original recipe catalog (${response.status}).`);
  const source = await response.text();
  const literal = extractCatalogLiteral(source);

  // The literal comes from this app's own trusted, versioned legacy bundle.
  const parsed = Function(`"use strict"; return (${literal});`)() as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length < 30 ||
    parsed.length > 500 ||
    !parsed.some(item => text((item as LegacyRecipe)?.title) === KNOWN_RECIPE_TITLE) ||
    parsed.filter(item => Array.isArray((item as LegacyRecipe)?.ingredients) && Array.isArray((item as LegacyRecipe)?.directions)).length < Math.floor(parsed.length * 0.8)
  ) throw new Error('Original recipe catalog did not pass validation.');

  const converted = parsed.map((recipe, index) => convertRecipe(recipe as LegacyRecipe, index)).filter((recipe): recipe is Recipe => Boolean(recipe));
  if (converted.length < 30) throw new Error('Original recipe catalog conversion was incomplete.');

  const existingIds = new Set(state.recipes.map(recipe => recipe.id));
  const existingTitles = new Set(state.recipes.map(recipe => recipe.title.toLowerCase()));
  let added = 0;
  for (const recipe of converted) {
    if (existingIds.has(recipe.id) || existingTitles.has(recipe.title.toLowerCase())) continue;
    state.recipes.push(recipe);
    existingIds.add(recipe.id);
    existingTitles.add(recipe.title.toLowerCase());
    added += 1;
  }
  localStorage.setItem(MIGRATION_KEY, 'done');
  return added;
};
