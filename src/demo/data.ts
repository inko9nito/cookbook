// Sample data for the Phase 0 demo. Replaced by the real database in Phase 1.

/** One row in a recipe's ingredient list: an ingredient, or a group header ("For the sauce"). */
export type DemoIngredient = {
  id: string;
  /** 'header' rows are group titles; their title is in `name` */
  kind?: 'header';
  amount: string;
  unit: string;
  name: string;
  note: string;
};

/** One row in a recipe's directions: a step, or a group header ("Prep", "Grill"). */
export type DemoStep = {
  id: string;
  kind?: 'header';
  text: string;
};

export type DemoRecipe = {
  id: string;
  title: string;
  source: string;
  servings: number;
  servingSize: string;
  prepMinutes: number;
  cookMinutes: number;
  /** total time, kept in sync with prep + cook by the editor */
  minutes: number;
  createdAt: string;
  /** Sample photo (public/photos) or a photo picked on the phone (data URL). Without one, a warm color placeholder shows. */
  photo?: string;
  /** Placeholder color used when there is no photo */
  tone: 'corn' | 'grill' | 'soup' | 'drink' | 'green';
  /** Course types (from COURSES) and the user's own tags, all lowercase */
  tags: string[];
  ingredients: DemoIngredient[];
  steps: DemoStep[];
  notes: string;
  rating: number;
  timesMade: number;
};

export const COURSES = ['breakfast', 'lunch', 'dinner', 'snack', 'appetizer', 'soup', 'salad', 'side', 'dessert', 'drink'];

let nextId = 1000;
export const newId = () => String(nextId++);

const ing = (amount: string, unit: string, name: string, note = ''): DemoIngredient => ({ id: newId(), amount, unit, name, note });
const group = (name: string): DemoIngredient => ({ id: newId(), kind: 'header', amount: '', unit: '', name, note: '' });
const step = (text: string): DemoStep => ({ id: newId(), text });
const stepGroup = (text: string): DemoStep => ({ id: newId(), kind: 'header', text });

export const demoRecipes: DemoRecipe[] = [
  {
    id: '1',
    title: 'Corn pudding',
    tone: 'corn',
    photo: '/photos/corn.jpg',
    source: 'My recipe',
    servings: 8,
    servingSize: '1 slice',
    prepMinutes: 20,
    cookMinutes: 55,
    minutes: 75,
    createdAt: '2026-11-10',
    tags: ['side', 'dessert', 'holiday'],
    rating: 5,
    timesMade: 3,
    ingredients: [
      group('For the pudding'),
      ing('1/4', 'cup', 'sugar'),
      ing('3', 'tbsp', 'flour'),
      ing('2', 'tsp', 'baking powder'),
      ing('1-2', 'tsp', 'salt', 'to taste'),
      ing('6', '', 'eggs'),
      ing('2', 'cups', 'whipping cream'),
      ing('1/2', 'cup', 'butter', 'melted'),
      ing('6', 'cups', 'fresh corn kernels'),
    ],
    steps: [
      stepGroup('Prep'),
      step('Heat the oven to 350°F and butter a 9×13 baking dish.'),
      step('Whisk the sugar, flour, baking powder and salt together.'),
      stepGroup('Bake'),
      step('Beat in the eggs, then the cream and melted butter.'),
      step('Stir in the corn, pour into the dish and bake 45 minutes until set and golden.'),
    ],
    notes: 'Halve the sugar if the corn is very sweet. Freezes well for a month.',
  },
  {
    id: '2',
    title: 'Middle Eastern Chicken Kebabs',
    tone: 'grill',
    photo: '/photos/kebabs.jpg',
    source: 'onceuponachef.com',
    servings: 4,
    servingSize: '2 skewers',
    prepMinutes: 20,
    cookMinutes: 15,
    minutes: 35,
    createdAt: '2026-10-02',
    tags: ['dinner'],
    rating: 5,
    timesMade: 2,
    ingredients: [
      group('Marinade'),
      ing('1', 'cup', 'plain whole milk Greek yogurt'),
      ing('2', 'tbsp', 'olive oil'),
      ing('2', 'tsp', 'paprika'),
      ing('1/2', 'tsp', 'cumin'),
      ing('1/2-1', 'tsp', 'crushed red pepper flakes', 'reduce if you don’t like heat'),
      ing('3', 'cloves', 'garlic', 'minced'),
      group('Kebabs'),
      ing('2', 'lb', 'boneless chicken thighs', 'cut into 1½-inch pieces'),
      ing('1', 'large', 'red onion', 'cut into wedges'),
    ],
    steps: [
      stepGroup('Prep'),
      step('In a medium bowl, combine the yogurt, olive oil, paprika, cumin, red pepper flakes and garlic.'),
      step('Add the chicken, toss to coat, cover and refrigerate at least 8 hours.'),
      stepGroup('Grill'),
      step('Heat the grill to medium-high and lightly oil the grates.'),
      step('Thread the chicken and onion onto skewers and grill 10 to 15 minutes, turning occasionally.'),
    ],
    notes: 'Thighs stay juicier than breasts here.',
  },
  {
    id: '3',
    title: 'Italian Turkey Zucchini Meatballs',
    tone: 'soup',
    photo: '/photos/meatballs.jpg',
    source: 'My recipe',
    servings: 6,
    servingSize: '4 meatballs',
    prepMinutes: 15,
    cookMinutes: 25,
    minutes: 40,
    createdAt: '2026-09-14',
    tags: ['dinner'],
    rating: 4,
    timesMade: 1,
    ingredients: [
      ing('1', 'lb', 'ground turkey'),
      ing('1', 'small', 'zucchini', 'grated and squeezed dry'),
      ing('1/2-1', 'tsp', 'red pepper flakes', 'optional'),
    ],
    steps: [step('Mix everything gently.'), step('Roll into balls and bake 20 minutes.'), step('Simmer in marinara for 5 minutes.')],
    notes: '',
  },
  {
    id: '4',
    title: 'Pulled Beef with Parsnip Purée',
    tone: 'grill',
    photo: '/photos/pulled-beef.jpg',
    source: 'My recipe',
    servings: 6,
    servingSize: '',
    prepMinutes: 30,
    cookMinutes: 180,
    minutes: 210,
    createdAt: '2026-08-21',
    tags: ['dinner'],
    rating: 4,
    timesMade: 1,
    ingredients: [ing('3', 'lb', 'chuck roast'), ing('2', 'lb', 'parsnips', 'peeled')],
    steps: [step('Brown the beef, then braise 3 hours.'), step('Boil and purée the parsnips.'), step('Shred the beef over the purée.')],
    notes: '',
  },
  {
    id: '5',
    title: 'Mustard Dill Chicken Thighs',
    tone: 'green',
    photo: '/photos/mustard-chicken.jpg',
    source: 'sepcooks.com',
    servings: 4,
    servingSize: '',
    prepMinutes: 10,
    cookMinutes: 25,
    minutes: 35,
    createdAt: '2026-07-30',
    tags: ['dinner', 'quick'],
    rating: 0,
    timesMade: 0,
    ingredients: [ing('2', 'lb', 'chicken thighs', 'boneless'), ing('2', 'tbsp', 'Dijon mustard'), ing('1-2', 'tbsp', 'fresh dill', 'chopped')],
    steps: [step('Coat the chicken in mustard and dill.'), step('Roast at 425°F for 25 minutes.')],
    notes: '',
  },
];

export const emptyRecipe = (): DemoRecipe => ({
  id: newId(),
  title: '',
  source: '',
  servings: 4,
  servingSize: '',
  prepMinutes: 0,
  cookMinutes: 0,
  minutes: 0,
  createdAt: new Date().toISOString().slice(0, 10),
  tone: 'green',
  tags: [],
  ingredients: [],
  steps: [],
  notes: '',
  rating: 0,
  timesMade: 0,
});

export const demoCookbooks = [
  { id: 'k1', name: 'Bread', count: 6 },
  { id: 'k2', name: 'Dressings and sauces', count: 2 },
  { id: 'k3', name: 'Everything else', count: 70 },
  { id: 'k4', name: 'Grilling', count: 11 },
];

export const formatIngredient = (i: Pick<DemoIngredient, 'amount' | 'unit' | 'name' | 'note'>) =>
  [i.amount, i.unit, i.name].filter(Boolean).join(' ') + (i.note ? `, ${i.note}` : '');

export const titleCase = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
