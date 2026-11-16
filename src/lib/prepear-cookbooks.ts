// Issue #25: Prepear's cookbooks, from the export file kept by the Prepear import (#14), as this app's cookbooks.
// Pure functions, tested in prepear-cookbooks.test.ts; the Import from Prepear page runs them, then saves the cookbooks.
//
// A Prepear cookbook answer: { cookbook: { id, title, coverRecipeId, sections: [{ title, coverRecipeId, recipes: [ids],
// position }], uncategorizedRecipes: [ids] } }. Its recipe ids are Prepear's, either my edited copy's or the
// original's; the imported recipes keep both in `prepearIds`, which is how they're found here.

import type { Cookbook } from './cookbook';
import type { Recipe } from './recipe';
import { plainText, sentenceCase, uuidTime, type PrepearExport } from './prepear';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export type PrepearCookbookPlan = {
  /** cookbooks to bring in */
  cookbooks: Cookbook[];
  /** Prepear cookbooks brought in before */
  alreadyHere: number;
  /** recipes the cookbooks name that aren't here (deleted in Prepear, or not imported): left out */
  missingRecipes: number;
};

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);

/** The export's cookbooks that aren't here yet, with their recipes found among the imported ones. */
export function planPrepearCookbooks(exp: PrepearExport, recipes: Recipe[], existing: Cookbook[], newId: () => string): PrepearCookbookPlan {
  const here = new Map<string, string>();
  for (const r of recipes) for (const p of r.prepearIds ?? []) here.set(p, r.id);
  const brought = new Set(existing.flatMap((c) => (c.prepearId ? [c.prepearId] : [])));
  const missing = new Set<string>();
  const find = (list: string[]) => {
    const found: string[] = [];
    for (const p of list) {
      const id = here.get(p);
      if (id) found.push(id);
      else missing.add(p);
    }
    return [...new Set(found)];
  };

  // Prepear's order (the profile's list), then any answer the list didn't name
  const answers = exp.cookbooks ?? {};
  const order = [...new Set([...(exp.cookbookList ?? []).map((c: Json) => String(c?.id ?? '')), ...Object.keys(answers)])].filter((k) => answers[k]);

  const cookbooks: Cookbook[] = [];
  let alreadyHere = 0;
  for (const key of order) {
    const c: Json = answers[key]?.cookbook ?? answers[key];
    const prepearId = String(c?.id ?? key);
    const name = sentenceCase(plainText(c?.title)).slice(0, 120);
    if (!name) continue;
    if (brought.has(prepearId)) {
      alreadyHere++;
      continue;
    }
    const sections = (Array.isArray(c.sections) ? [...c.sections] : [])
      .map((s: Json, i: number) => ({ s, at: typeof s?.position === 'number' ? s.position : i }))
      .sort((a, b) => a.at - b.at)
      .map(({ s }) => ({
        id: newId(),
        name: plainText(s?.title).slice(0, 120) || 'Section',
        coverRecipeId: (s?.coverRecipeId && here.get(s.coverRecipeId)) || null,
        recipeIds: find(ids(s?.recipes)),
      }));
    cookbooks.push({
      id: newId(),
      name,
      coverRecipeId: (c.coverRecipeId && here.get(c.coverRecipeId)) || null,
      recipeIds: find(ids(c.uncategorizedRecipes)),
      sections,
      prepearId,
      createdAt: uuidTime(prepearId) ?? exp.exportedAt,
    });
  }
  return { cookbooks, alreadyHere, missingRecipes: missing.size };
}
