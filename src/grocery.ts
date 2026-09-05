import type { GroceryItem, Recipe } from './types.js';

const normalizedName = (value: string) => value.toLowerCase().replace(/\([^)]*\)/g, '').replace(/\b(?:chopped|minced|diced|sliced|optional|to taste|fresh|extra)\b/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const groceryFromRecipes = (recipes: Recipe[]): GroceryItem[] => {
  const map = new Map<string, GroceryItem>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredientSections.flatMap(section => section.ingredients)) {
      const key = normalizedName(ingredient.name || ingredient.raw) || ingredient.raw.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        if (!existing.recipeIds.includes(recipe.id)) existing.recipeIds.push(recipe.id);
        if (ingredient.quantityText && existing.quantityText !== ingredient.quantityText) existing.quantityText = `${existing.quantityText ?? ''}${existing.quantityText ? ' + ' : ''}${ingredient.quantityText}`;
      } else {
        map.set(key, {
          id: `g-${Math.random().toString(36).slice(2, 9)}`,
          name: ingredient.raw,
          quantityText: ingredient.quantityText,
          checked: false,
          recipeIds: [recipe.id]
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
};
