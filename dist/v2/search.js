export const recipeSearchText = (recipe) => [
  recipe.title, recipe.category, recipe.description, recipe.story, recipe.author, recipe.addedBy,
  ...recipe.tags, ...recipe.collections,
  ...recipe.ingredientSections.flatMap(section => section.ingredients.flatMap(item => [item.raw, item.name])),
  recipe.smoker?.wood, recipe.smoker?.smoke
].filter(Boolean).join(' ').toLowerCase();
export const searchRecipes = (recipes, rawQuery) => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return recipes;
  const under = query.match(/under\s+(\d+)\s*(?:min|minutes?)?/);
  const terms = query.replace(/under\s+\d+\s*(?:min|minutes?)?/, '').replace(/\bwith\b/g, ' ').split(/\s+/).filter(Boolean);
  return recipes.filter(recipe => {
    if (under) { const limit = Number(under[1]); const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0); if (!total || total > limit) return false; }
    const haystack = recipeSearchText(recipe);
    return terms.every(term => haystack.includes(term));
  });
};
