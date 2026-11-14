// Throwaway sample data for the Phase 0 feel check. Replaced by the real database in Phase 1.

export type DemoIngredient = {
  id: string;
  amount: string;
  unit: string;
  name: string;
  note: string;
};

export type DemoRecipe = {
  id: string;
  title: string;
  source: string;
  minutes: number;
  servings: number;
  createdAt: string;
  /** Placeholder photo color until real photos arrive in Phase 1 */
  tone: 'corn' | 'grill' | 'soup' | 'drink' | 'green';
  tags: string[];
  ingredients: DemoIngredient[];
  steps: string[];
};

let nextId = 1000;
export const newId = () => String(nextId++);

export const demoRecipes: DemoRecipe[] = [
  {
    id: '1',
    title: 'Corn pudding',
    tone: 'corn',
    source: 'My recipe',
    minutes: 75,
    servings: 8,
    createdAt: '2026-11-10',
    tags: ['side', 'dessert'],
    ingredients: [
      { id: 'a1', amount: '1/4', unit: 'cup', name: 'sugar', note: '' },
      { id: 'a2', amount: '3', unit: 'tbsp', name: 'flour', note: '' },
      { id: 'a3', amount: '2', unit: 'tsp', name: 'baking powder', note: '' },
      { id: 'a4', amount: '1-2', unit: 'tsp', name: 'salt', note: 'to taste' },
      { id: 'a5', amount: '6', unit: '', name: 'eggs', note: '' },
      { id: 'a6', amount: '2', unit: 'cups', name: 'whipping cream', note: '' },
      { id: 'a7', amount: '1/2', unit: 'cup', name: 'butter', note: 'melted' },
      { id: 'a8', amount: '6', unit: 'cups', name: 'fresh corn kernels', note: '' },
    ],
    steps: [
      'Heat the oven to 350°F and butter a 9×13 baking dish.',
      'Whisk the sugar, flour, baking powder and salt together.',
      'Beat in the eggs, then the cream and melted butter.',
      'Stir in the corn, pour into the dish and bake 45 minutes until set.',
    ],
  },
  {
    id: '2',
    title: 'Middle Eastern Chicken Kebabs',
    tone: 'grill',
    source: 'onceuponachef.com',
    minutes: 45,
    servings: 4,
    createdAt: '2026-10-02',
    tags: ['dinner'],
    ingredients: [
      { id: 'b1', amount: '2', unit: 'lb', name: 'chicken thighs', note: 'cut into 1½-inch pieces' },
      { id: 'b2', amount: '1/2', unit: 'cup', name: 'plain yogurt', note: '' },
      { id: 'b3', amount: '3', unit: 'cloves', name: 'garlic', note: 'minced' },
    ],
    steps: ['Marinate the chicken.', 'Thread onto skewers and grill.'],
  },
  {
    id: '3',
    title: 'Best Lentil Soup',
    tone: 'soup',
    source: 'My recipe',
    minutes: 50,
    servings: 6,
    createdAt: '2026-08-21',
    tags: ['soup', 'dinner'],
    ingredients: [
      { id: 'c1', amount: '1', unit: 'cup', name: 'brown lentils', note: 'rinsed' },
      { id: 'c2', amount: '1', unit: 'large', name: 'onion', note: 'chopped' },
    ],
    steps: ['Sauté the onion.', 'Add lentils and stock; simmer 30 minutes.'],
  },
  {
    id: '4',
    title: 'German Glühwein',
    tone: 'drink',
    source: 'thekitchn.com',
    minutes: 25,
    servings: 6,
    createdAt: '2025-12-01',
    tags: ['drink'],
    ingredients: [{ id: 'd1', amount: '1', unit: 'bottle', name: 'red wine', note: '' }],
    steps: ['Warm everything gently. Do not boil.'],
  },
];

export const demoCookbooks = [
  { id: 'k1', name: 'Bread', count: 6 },
  { id: 'k2', name: 'Dressings and sauces', count: 2 },
  { id: 'k3', name: 'Everything else', count: 70 },
  { id: 'k4', name: 'Grilling', count: 11 },
];

export const formatIngredient = (i: Pick<DemoIngredient, 'amount' | 'unit' | 'name' | 'note'>) =>
  [i.amount, i.unit, i.name].filter(Boolean).join(' ') + (i.note ? `, ${i.note}` : '');
