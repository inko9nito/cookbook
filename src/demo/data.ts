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
  /** Sample photo (in public/photos). Recipes without one show a warm color placeholder. */
  photo?: string;
  /** Placeholder color used when there is no photo */
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
    photo: '/photos/corn.jpg',
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
    photo: '/photos/kebabs.jpg',
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
    title: 'Italian Turkey Zucchini Meatballs',
    tone: 'soup',
    photo: '/photos/meatballs.jpg',
    source: 'My recipe',
    minutes: 40,
    servings: 6,
    createdAt: '2026-09-14',
    tags: ['dinner'],
    ingredients: [
      { id: 'c1', amount: '1', unit: 'lb', name: 'ground turkey', note: '' },
      { id: 'c2', amount: '1', unit: 'small', name: 'zucchini', note: 'grated and squeezed dry' },
      { id: 'c3', amount: '1/2-1', unit: 'tsp', name: 'red pepper flakes', note: 'optional' },
    ],
    steps: ['Mix everything gently.', 'Roll into balls and bake 20 minutes.', 'Simmer in marinara for 5 minutes.'],
  },
  {
    id: '4',
    title: 'Pulled Beef with Parsnip Purée',
    tone: 'grill',
    photo: '/photos/pulled-beef.jpg',
    source: 'My recipe',
    minutes: 210,
    servings: 6,
    createdAt: '2026-08-21',
    tags: ['dinner'],
    ingredients: [
      { id: 'd1', amount: '3', unit: 'lb', name: 'chuck roast', note: '' },
      { id: 'd2', amount: '2', unit: 'lb', name: 'parsnips', note: 'peeled' },
    ],
    steps: ['Brown the beef, then braise 3 hours.', 'Boil and purée the parsnips.', 'Shred the beef over the purée.'],
  },
  {
    id: '5',
    title: 'Mustard Dill Chicken Thighs',
    tone: 'green',
    photo: '/photos/mustard-chicken.jpg',
    source: 'sepcooks.com',
    minutes: 35,
    servings: 4,
    createdAt: '2026-07-30',
    tags: ['dinner', 'quick'],
    ingredients: [
      { id: 'e1', amount: '2', unit: 'lb', name: 'chicken thighs', note: 'boneless' },
      { id: 'e2', amount: '2', unit: 'tbsp', name: 'Dijon mustard', note: '' },
      { id: 'e3', amount: '1-2', unit: 'tbsp', name: 'fresh dill', note: 'chopped' },
    ],
    steps: ['Coat the chicken in mustard and dill.', 'Roast at 425°F for 25 minutes.'],
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
