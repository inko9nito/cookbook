import { describe, expect, test } from 'vitest';
import { planPrepearCookbooks } from './prepear-cookbooks';
import type { PrepearExport } from './prepear';
import { emptyRecipe, type Recipe } from './recipe';
import type { Cookbook } from './cookbook';

// Made-up data only: the repo is public (CLAUDE.md). Prepear ids are time-based UUIDs like these.
const PREP_BOOK = '35c75b60-063d-11e9-8000-000000000001';

const exp = (cookbooks: Record<string, unknown>, cookbookList?: unknown[]): PrepearExport => ({
  format: 'prepear-export',
  version: 1,
  exportedAt: '2026-11-16T00:00:00.000Z',
  profile: { id: 'me', slug: 'me' },
  recipes: {},
  cookbooks,
  ...(cookbookList ? { cookbookList } : {}),
});

const recipe = (id: string, prepearIds: string[]): Recipe => ({ ...emptyRecipe(), id, title: id, prepearIds });
const recipes = [recipe('soup', ['p-soup', 'p-soup-original']), recipe('bread', ['p-bread']), recipe('fish', ['p-fish'])];

let n = 0;
const newId = () => `new-${++n}`;

describe('Prepear cookbooks', () => {
  test('a cookbook with sections: names, order, covers, recipes found by either Prepear id', () => {
    n = 0;
    const plan = planPrepearCookbooks(
      exp({
        [PREP_BOOK]: {
          cookbook: {
            id: PREP_BOOK,
            title: 'everything else',
            coverRecipeId: 'p-bread',
            uncategorizedRecipes: ['p-bread', 'p-gone'],
            sections: [
              { title: 'Seafood', position: 1, coverRecipeId: 'p-nope', recipes: ['p-fish'] },
              { title: 'Soups &amp; stews', position: 0, coverRecipeId: 'p-soup-original', recipes: ['p-soup-original', 'p-soup'] },
            ],
          },
          recipes: {},
        },
      }),
      recipes,
      [],
      newId,
    );
    expect(plan).toEqual({
      alreadyHere: 0,
      missingRecipes: 1,
      cookbooks: [
        {
          id: 'new-3',
          name: 'Everything else',
          coverRecipeId: 'bread',
          recipeIds: ['bread'],
          sections: [
            // sorted by Prepear's position; both of the soup's ids find one recipe, kept once
            { id: 'new-1', name: 'Soups & stews', coverRecipeId: 'soup', recipeIds: ['soup'] },
            { id: 'new-2', name: 'Seafood', coverRecipeId: null, recipeIds: ['fish'] },
          ],
          prepearId: PREP_BOOK,
          // the time in Prepear's time-based id
          createdAt: '2018-12-22T22:59:17.654Z',
        },
      ],
    });
  });

  test('cookbooks already brought in are skipped; the list’s order is kept', () => {
    const existing: Cookbook[] = [{ id: 'x', name: 'Bread', recipeIds: [], sections: [], prepearId: 'b1', createdAt: '2026-11-16T00:00:00.000Z' }];
    const plan = planPrepearCookbooks(
      exp(
        {
          b1: { cookbook: { id: 'b1', title: 'Bread', uncategorizedRecipes: ['p-bread'], sections: [] } },
          b2: { cookbook: { id: 'b2', title: 'Soups', uncategorizedRecipes: ['p-soup'], sections: [] } },
          b3: { cookbook: { id: 'b3', title: 'Fish', uncategorizedRecipes: ['p-fish'], sections: [] } },
        },
        [{ id: 'b3' }, { id: 'b1' }, { id: 'b2' }],
      ),
      recipes,
      existing,
      newId,
    );
    expect(plan.alreadyHere).toBe(1);
    expect(plan.cookbooks.map((c) => c.name)).toEqual(['Fish', 'Soups']);
    // an id that isn't a time-based UUID: the export's date
    expect(plan.cookbooks[0].createdAt).toBe('2026-11-16T00:00:00.000Z');
  });

  test('an answer with no title is left out; no cookbooks at all is fine', () => {
    expect(planPrepearCookbooks(exp({ z: { cookbook: { id: 'z', title: '' } } }), recipes, [], newId).cookbooks).toEqual([]);
    expect(planPrepearCookbooks({ ...exp({}), cookbooks: undefined }, recipes, [], newId)).toEqual({ cookbooks: [], alreadyHere: 0, missingRecipes: 0 });
  });
});
