const MIGRATION_KEY = 'family-cookbook:bundled-catalog:v1';
const LEGACY_BUNDLE = '/assets/index-DN7Jouwl.js';
const FIRST_RECIPE_MARKER = '{id:"smoked-chicken-thighs-crispy-skin",title:"Smoked Chicken Thighs (Crispy Skin)"';
const text = (value) => String(value ?? '').trim();
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const minutes = (value) => {
    const match = text(value).match(/(\d+)/);
    return match ? Number(match[1]) : undefined;
};
const parseDate = (value) => {
    const parsed = Date.parse(text(value));
    return Number.isFinite(parsed) ? parsed : Date.UTC(2026, 0, 1);
};
const rawIngredient = (ingredient) => [text(ingredient.quantity), text(ingredient.unit), text(ingredient.item)].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
const extractCatalogLiteral = (source) => {
    const marker = source.indexOf(FIRST_RECIPE_MARKER);
    if (marker < 0)
        throw new Error('Legacy recipe catalog marker was not found.');
    const start = source.lastIndexOf('[', marker);
    if (start < 0)
        throw new Error('Legacy recipe catalog start was not found.');
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let i = start; i < source.length; i += 1) {
        const char = source[i] ?? '';
        if (quote) {
            if (escaped)
                escaped = false;
            else if (char === '\\')
                escaped = true;
            else if (char === quote)
                quote = '';
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            quote = char;
            continue;
        }
        if (char === '[')
            depth += 1;
        else if (char === ']') {
            depth -= 1;
            if (depth === 0)
                return source.slice(start, i + 1);
        }
    }
    throw new Error('Legacy recipe catalog end was not found.');
};
const convertRecipe = (legacy, index) => {
    const title = text(legacy.title);
    if (!title)
        return null;
    const id = text(legacy.id) || `legacy-${slug(title)}-${index}`;
    const category = text(legacy.category) || 'Family recipes';
    const smokerRaw = legacy.smokerDetails;
    const isSmoker = Boolean(smokerRaw) || /smok|bbq|barbecue/i.test(category);
    const createdAt = parseDate(legacy.postDate);
    const ingredientSections = Array.isArray(legacy.ingredientSections)
        ? legacy.ingredientSections.map((section, sectionIndex) => ({
            id: `${id}-ingredients-${sectionIndex}`,
            title: text(section.name) || 'Ingredients',
            ingredients: Array.isArray(section.ingredients) ? section.ingredients.map((item, itemIndex) => {
                const raw = rawIngredient(item);
                return { id: `${id}-ingredient-${sectionIndex}-${itemIndex}`, raw, name: text(item.item) || raw };
            }).filter(item => item.raw) : []
        })).filter(section => section.ingredients.length) : [];
    const steps = Array.isArray(legacy.directions) ? legacy.directions.map((direction, stepIndex) => ({
        id: text(direction.id) || `${id}-step-${stepIndex}`,
        text: text(direction.text)
    })).filter(step => step.text) : [];
    const smoker = smokerRaw ? {
        pitTemperatureF: minutes(smokerRaw.temp),
        wood: text(smokerRaw.wood) || undefined,
        smoke: text(smokerRaw.smoke) || undefined,
        targetInternalF: text(smokerRaw.targetInternal) || undefined,
        time: text(smokerRaw.time) || undefined,
        finish: text(smokerRaw.finish) || undefined,
        restMinutes: minutes(smokerRaw.rest)
    } : undefined;
    return {
        id,
        title,
        description: text(legacy.description) || undefined,
        category,
        image: text(legacy.coverImage) || undefined,
        servings: 4,
        prepMinutes: minutes(legacy.prepTime),
        cookMinutes: minutes(legacy.cookTime),
        cookLabel: text(legacy.cookTime) || undefined,
        tags: [
            ...(Array.isArray(legacy.dietaryTags) ? legacy.dietaryTags.map(text).filter(Boolean) : []),
            ...(isSmoker ? ['smoker'] : [])
        ],
        collections: isSmoker ? ["Jay's Pit House", category] : [category],
        ingredientSections,
        directionSections: steps.length ? [{ id: `${id}-directions`, title: 'Directions', steps }] : [],
        smoker,
        notes: [],
        history: [{ id: `${id}-legacy-migration`, at: createdAt, summary: 'Migrated from the original Family Cookbook' }],
        favorite: false,
        createdAt,
        updatedAt: createdAt
    };
};
export const migrateBundledLegacyCatalog = async (state) => {
    if (localStorage.getItem(MIGRATION_KEY) === 'done')
        return 0;
    const response = await fetch(LEGACY_BUNDLE, { cache: 'force-cache' });
    if (!response.ok)
        throw new Error(`Could not load the original recipe catalog (${response.status}).`);
    const source = await response.text();
    const literal = extractCatalogLiteral(source);
    // The literal is extracted only from the app's own trusted, versioned legacy bundle.
    const parsed = Function(`"use strict"; return (${literal});`)();
    if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > 500)
        throw new Error('Original recipe catalog did not pass validation.');
    const existingIds = new Set(state.recipes.map(recipe => recipe.id));
    const existingTitles = new Set(state.recipes.map(recipe => recipe.title.toLowerCase()));
    const converted = parsed.map((recipe, index) => convertRecipe(recipe, index)).filter((recipe) => Boolean(recipe));
    let added = 0;
    for (const recipe of converted) {
        if (existingIds.has(recipe.id) || existingTitles.has(recipe.title.toLowerCase()))
            continue;
        state.recipes.push(recipe);
        existingIds.add(recipe.id);
        existingTitles.add(recipe.title.toLowerCase());
        added += 1;
    }
    localStorage.setItem(MIGRATION_KEY, 'done');
    return added;
};
//# sourceMappingURL=legacy-catalog.js.map
