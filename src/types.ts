export type Ingredient = {
  id: string;
  raw: string;
  quantity?: number;
  quantityText?: string;
  unit?: string;
  name: string;
  preparation?: string;
};

export type IngredientSection = {
  id: string;
  title: string;
  ingredients: Ingredient[];
};

export type RecipeStep = {
  id: string;
  text: string;
  timerMinutes?: number;
  temperatureF?: number;
};

export type DirectionSection = {
  id: string;
  title: string;
  steps: RecipeStep[];
};

export type SmokeProfile = {
  pitTemperatureF?: number;
  wood?: string;
  smoke?: string;
  targetInternalF?: string;
  time?: string;
  finish?: string;
  restMinutes?: number;
};

export type RecipeRevision = {
  id: string;
  at: number;
  summary: string;
  by?: string;
};

export type Recipe = {
  id: string;
  title: string;
  category: string;
  image?: string;
  description?: string;
  story?: string;
  author?: string;
  addedBy?: string;
  source?: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  cookLabel?: string;
  marinate?: string;
  tags: string[];
  collections: string[];
  ingredientSections: IngredientSection[];
  directionSections: DirectionSection[];
  smoker?: SmokeProfile;
  pitNotes?: string;
  note?: string;
  notes: string[];
  history: RecipeRevision[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  lastCookedAt?: number;
};

export type CookbookState = {
  version: 2;
  recipes: Recipe[];
  grocery: GroceryItem[];
};

export type GroceryItem = {
  id: string;
  name: string;
  quantityText?: string;
  checked: boolean;
  recipeIds: string[];
};

export type CookProgress = {
  recipeId: string;
  stepIndex: number;
  startedAt: number;
  updatedAt: number;
};

export type ImportPreview = {
  packageName: string;
  recipes: Recipe[];
  warnings: string[];
  duplicateIds: string[];
};
