import { saveState } from './storage.js';
const MIGRATION_KEY = 'family-cookbook:bundled-catalog:v2';
const LEGACY_BUNDLE = '/assets/index-DN7Jouwl.js';
const IMAGE_MANIFEST = '/recipe-images/manifest.json';
const KNOWN_RECIPE_TITLE = 'Apple Crisp Snack Mix';
const CATALOG_START = /\[\s*\{\s*id\s*:/g;
const text = (value) => String(value ?? '').trim();
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const numberValue = (value) => {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    const match = text(value).match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : undefined;
};
const looksLikeHeading = (value) => value.length > 0 && value.length <= 46 && !/\d/.test(value) && value === value.toUpperCase() && /[A-Z]/.test(value);
const titleCase = (value) => value.toLowerCase().replace(/(^|[\s/&-])\w/g, match => match.toUpperCase());
const extractArrayLiteral = (source, start) => {
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
/** Parses the data-only subset of JavaScript used by the preserved minified bundle. */
class LegacyLiteralParser {
    source;
    index = 0;
    constructor(source) {
        this.source = source;
    }
    parse() {
        const value = this.parseValue();
        this.skipWhitespace();
        if (this.index !== this.source.length)
            this.fail('Unexpected content after the catalog');
        return value;
    }
    parseValue() {
        this.skipWhitespace();
        const char = this.source[this.index];
        let value;
        if (char === '!') {
            this.index += 1;
            value = !this.parseValue();
        }
        else if (char === '[')
            value = this.parseArray();
        else if (char === '{')
            value = this.parseObject();
        else if (char === '"' || char === "'" || char === '`')
            value = this.parseString();
        else if (char === '-' || (char && /\d/.test(char)))
            value = this.parseNumber();
        else {
            const identifier = this.parseIdentifier();
            if (identifier === 'null')
                value = null;
            else if (identifier === 'true')
                value = true;
            else if (identifier === 'false')
                value = false;
            else if (identifier === 'undefined')
                value = undefined;
            else
                this.fail(`Unsupported value ${identifier || '(empty)'}`);
        }
        // Five legacy fields compact arrays as a string literal followed by split().
        // Support only that non-executable, allow-listed expression shape.
        this.skipWhitespace();
        if (this.source.startsWith('.split', this.index)) {
            if (typeof value !== 'string')
                this.fail('split() is only supported on strings');
            this.index += '.split'.length;
            this.expect('(');
            const separator = this.parseValue();
            if (typeof separator !== 'string')
                this.fail('split() requires a string separator');
            this.expect(')');
            value = value.split(separator);
        }
        return value;
    }
    parseArray() {
        const result = [];
        this.expect('[');
        this.skipWhitespace();
        while (this.source[this.index] !== ']') {
            result.push(this.parseValue());
            this.skipWhitespace();
            if (this.source[this.index] !== ',')
                break;
            this.index += 1;
            this.skipWhitespace();
            if (this.source[this.index] === ']')
                break;
        }
        this.expect(']');
        return result;
    }
    parseObject() {
        const result = {};
        this.expect('{');
        this.skipWhitespace();
        while (this.source[this.index] !== '}') {
            const char = this.source[this.index];
            const key = char === '"' || char === "'" || char === '`' ? this.parseString() : this.parseIdentifier();
            if (!key)
                this.fail('Expected an object key');
            this.skipWhitespace();
            this.expect(':');
            result[key] = this.parseValue();
            this.skipWhitespace();
            if (this.source[this.index] !== ',')
                break;
            this.index += 1;
            this.skipWhitespace();
            if (this.source[this.index] === '}')
                break;
        }
        this.expect('}');
        return result;
    }
    parseString() {
        const quote = this.source[this.index] ?? '';
        this.index += 1;
        let result = '';
        while (this.index < this.source.length) {
            const char = this.source[this.index] ?? '';
            this.index += 1;
            if (char === quote)
                return result;
            if (char !== '\\') {
                if (quote === '`' && char === '$' && this.source[this.index] === '{')
                    this.fail('Template expressions are not data');
                result += char;
                continue;
            }
            const escaped = this.source[this.index] ?? '';
            this.index += 1;
            const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
            if (escaped in simple)
                result += simple[escaped];
            else if (escaped === '\n') { /* JavaScript line continuation */ }
            else if (escaped === '\r') {
                if (this.source[this.index] === '\n')
                    this.index += 1;
            }
            else if (escaped === 'x')
                result += this.parseCodePoint(2);
            else if (escaped === 'u') {
                if (this.source[this.index] === '{') {
                    this.index += 1;
                    const end = this.source.indexOf('}', this.index);
                    if (end < 0)
                        this.fail('Unterminated Unicode escape');
                    const raw = this.source.slice(this.index, end);
                    if (!/^[\da-f]+$/i.test(raw))
                        this.fail('Invalid Unicode escape');
                    result += String.fromCodePoint(Number.parseInt(raw, 16));
                    this.index = end + 1;
                }
                else
                    result += this.parseCodePoint(4);
            }
            else
                result += escaped;
        }
        this.fail('Unterminated string');
    }
    parseCodePoint(length) {
        const raw = this.source.slice(this.index, this.index + length);
        if (raw.length !== length || !/^[\da-f]+$/i.test(raw))
            this.fail('Invalid character escape');
        this.index += length;
        return String.fromCharCode(Number.parseInt(raw, 16));
    }
    parseNumber() {
        const match = /^-?(?:0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(this.source.slice(this.index));
        if (!match)
            this.fail('Invalid number');
        this.index += match[0].length;
        const value = Number(match[0]);
        if (!Number.isFinite(value))
            this.fail('Invalid finite number');
        return value;
    }
    parseIdentifier() {
        const match = /^[A-Za-z_$][\w$]*/.exec(this.source.slice(this.index));
        if (!match)
            return '';
        this.index += match[0].length;
        return match[0];
    }
    skipWhitespace() {
        while (/\s/.test(this.source[this.index] ?? ''))
            this.index += 1;
    }
    expect(expected) {
        this.skipWhitespace();
        if (this.source[this.index] !== expected)
            this.fail(`Expected ${expected}`);
        this.index += 1;
    }
    fail(message) {
        throw new Error(`${message} at legacy catalog offset ${this.index}.`);
    }
}
const isValidCatalog = (value) => Array.isArray(value) &&
    value.length >= 30 &&
    value.length <= 500 &&
    value.some(item => text(item?.title) === KNOWN_RECIPE_TITLE) &&
    value.filter(item => Array.isArray(item?.ingredients) && Array.isArray(item?.directions)).length >= Math.floor(value.length * 0.8);
export const parseLegacyCatalog = (source) => {
    CATALOG_START.lastIndex = 0;
    let catalogError;
    for (const match of source.matchAll(CATALOG_START)) {
        try {
            const literal = extractArrayLiteral(source, match.index ?? 0);
            const parsed = new LegacyLiteralParser(literal).parse();
            if (isValidCatalog(parsed))
                return parsed;
        }
        catch (error) {
            if (source.slice(match.index ?? 0, (match.index ?? 0) + 700_000).includes(KNOWN_RECIPE_TITLE))
                catalogError = error;
            // Other arrays in the minified application are not the recipe catalog.
        }
    }
    throw new Error('Legacy recipe catalog was not found or did not pass validation.', { cause: catalogError });
};
const normalizeImagePath = (value, availableImages) => {
    const requested = text(value).split(/[?#]/, 1)[0] ?? '';
    if (!/^\/recipe-images\/[a-z0-9._/-]+$/i.test(requested) || requested.includes('..'))
        return undefined;
    if (availableImages.has(requested))
        return requested;
    const basename = requested.slice(requested.lastIndexOf('/') + 1);
    const matches = [...availableImages].filter(path => path.endsWith(`/${basename}`));
    return matches.length === 1 ? matches[0] : undefined;
};
const normalizeIngredientSections = (legacy, id) => {
    if (Array.isArray(legacy.ingredientSections) && legacy.ingredientSections.length) {
        return legacy.ingredientSections.map((section, sectionIndex) => {
            const items = Array.isArray(section.items) ? section.items : Array.isArray(section.ingredients) ? section.ingredients : [];
            return {
                id: `${id}-ingredients-${sectionIndex}`,
                title: text(section.title ?? section.name) || 'Ingredients',
                ingredients: items.map((item, itemIndex) => {
                    const raw = typeof item === 'object' && item !== null && 'raw' in item ? text(item.raw) : text(item);
                    const name = typeof item === 'object' && item !== null && 'name' in item ? text(item.name) : raw;
                    return { id: `${id}-ingredient-${sectionIndex}-${itemIndex}`, raw, name: name || raw };
                }).filter(item => item.raw)
            };
        }).filter(section => section.ingredients.length);
    }
    const flat = Array.isArray(legacy.ingredients) ? legacy.ingredients.map(text).filter(Boolean) : [];
    const groups = [];
    let current = { title: 'Ingredients', items: [] };
    for (const raw of flat) {
        if (looksLikeHeading(raw)) {
            if (current.items.length)
                groups.push(current);
            current = { title: titleCase(raw), items: [] };
        }
        else
            current.items.push(raw);
    }
    if (current.items.length)
        groups.push(current);
    if (!groups.length && flat.length)
        groups.push({ title: 'Ingredients', items: flat });
    return groups.map((group, sectionIndex) => ({
        id: `${id}-ingredients-${sectionIndex}`,
        title: group.title,
        ingredients: group.items.map((raw, itemIndex) => ({ id: `${id}-ingredient-${sectionIndex}-${itemIndex}`, raw, name: raw }))
    }));
};
const normalizeDirectionSections = (legacy, id) => {
    if (Array.isArray(legacy.directionSections) && legacy.directionSections.length) {
        return legacy.directionSections.map((section, sectionIndex) => ({
            id: `${id}-directions-${sectionIndex}`,
            title: text(section.title ?? section.name) || 'Directions',
            steps: (Array.isArray(section.steps) ? section.steps : []).map((step, stepIndex) => ({
                id: `${id}-step-${sectionIndex}-${stepIndex}`,
                text: typeof step === 'object' && step !== null && 'text' in step ? text(step.text) : text(step)
            })).filter(step => step.text)
        })).filter(section => section.steps.length);
    }
    const steps = Array.isArray(legacy.directions) ? legacy.directions.map((step, stepIndex) => ({
        id: `${id}-step-${stepIndex}`,
        text: typeof step === 'object' && step !== null && 'text' in step ? text(step.text) : text(step)
    })).filter(step => step.text) : [];
    return steps.length ? [{ id: `${id}-directions`, title: 'Directions', steps }] : [];
};
const noteList = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value) ? [text(value)] : [];
const convertRecipe = (legacy, index, availableImages) => {
    const title = text(legacy.title);
    if (!title)
        return null;
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
        image: normalizeImagePath(legacy.image, availableImages),
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
export const migrateBundledLegacyCatalog = async (state) => {
    if (localStorage.getItem(MIGRATION_KEY) === 'done')
        return 0;
    const [bundleResponse, imageResponse] = await Promise.all([
        fetch(LEGACY_BUNDLE, { cache: 'force-cache' }),
        fetch(IMAGE_MANIFEST, { cache: 'force-cache' })
    ]);
    if (!bundleResponse.ok)
        throw new Error(`Could not load the original recipe catalog (${bundleResponse.status}).`);
    if (!imageResponse.ok)
        throw new Error(`Could not load the recipe image manifest (${imageResponse.status}).`);
    const [source, imageManifest] = await Promise.all([bundleResponse.text(), imageResponse.json()]);
    if (!Array.isArray(imageManifest) || imageManifest.some(path => typeof path !== 'string' || !path.startsWith('/recipe-images/'))) {
        throw new Error('Recipe image manifest did not pass validation.');
    }
    const parsed = parseLegacyCatalog(source);
    const availableImages = new Set(imageManifest);
    const converted = parsed.map((recipe, index) => convertRecipe(recipe, index, availableImages)).filter((recipe) => Boolean(recipe));
    if (converted.length < 30)
        throw new Error('Original recipe catalog conversion was incomplete.');
    const existingIds = new Map(state.recipes.map((recipe, index) => [recipe.id, index]));
    const existingTitles = new Map(state.recipes.map((recipe, index) => [recipe.title.toLowerCase(), index]));
    let added = 0;
    const nextRecipes = [...state.recipes];
    for (const recipe of converted) {
        const existingIndex = existingIds.get(recipe.id) ?? existingTitles.get(recipe.title.toLowerCase());
        if (existingIndex !== undefined) {
            const existing = nextRecipes[existingIndex];
            const cameFromBundledCatalog = existing?.history.some(entry => entry.summary === 'Migrated from the original Family Cookbook');
            if (existing && cameFromBundledCatalog) {
                const repairedImage = normalizeImagePath(existing.image, availableImages) ?? recipe.image;
                if (repairedImage !== existing.image)
                    nextRecipes[existingIndex] = { ...existing, image: repairedImage };
            }
            continue;
        }
        nextRecipes.push(recipe);
        existingIds.set(recipe.id, nextRecipes.length - 1);
        existingTitles.set(recipe.title.toLowerCase(), nextRecipes.length - 1);
        added += 1;
    }
    // Save the catalog before recording completion. A failed/quota-limited write must
    // retry next load instead of permanently stranding a browser with only seed data.
    const changed = added > 0 || nextRecipes.some((recipe, index) => recipe !== state.recipes[index]);
    if (changed)
        saveState({ ...state, recipes: nextRecipes });
    state.recipes = nextRecipes;
    localStorage.setItem(MIGRATION_KEY, 'done');
    return added;
};
//# sourceMappingURL=legacy-catalog.js.map