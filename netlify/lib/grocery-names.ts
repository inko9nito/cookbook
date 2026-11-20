// What each ingredient is on the grocery list (issue #64; the shape is src/lib/grocery-names.ts). Claude names an
// ingredient name the first time it's needed, through Netlify's AI Gateway (as reading recipes does: the gateway gives
// functions ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL, billed to the Netlify account), and the answer is kept in the
// grocery_names table, so each name is asked about once. Corrections from the phone are kept there too (by 'you') and
// Claude never overwrites them. netlify/functions/grocery-names.mts and grocery-names-background.mts call these; the
// tests run them against a local database with a stand-in for Claude.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { getDatabase } from '@netlify/database';
import { z } from 'zod';
import { AISLES, GroceryName, GroceryThing, nameOf } from '../../src/lib/grocery-names';

type Sql = Pick<ReturnType<typeof getDatabase>, 'sql'>['sql'];

/**
 * A small, fast model: naming ingredients is simple sorting, asked about in batches; the site can set
 * GROCERY_NAMES_MODEL instead (e.g. if the gateway doesn't offer this one).
 */
export const DEFAULT_MODEL = 'claude-haiku-5-5';

/** Names asked about in one call to Claude (the answer stays well inside a function's 30 seconds). */
export const BATCH = 60;

export const SYSTEM = `You turn ingredients from a personal recipe app into grocery list entries. You get ingredient names as recipes wrote them, one per line, without their amounts. For each one, say what to buy at a grocery store.

Answer for every name, with the name exactly as given and its things. A name is usually one thing. When the recipe offers a choice ("soy sauce or tamari", "honey/maple syrup", "lemon or lime juice"), give each choice as its own thing, in the order written ("lemon juice", then "lime juice"). When it names things that are all needed ("salt and pepper"), give one thing as written.

For each thing:
- item: the product to look for in a store, singular, in lowercase except for names ("Greek yogurt", "Dijon mustard"), as specific as matters when taking it off the shelf ("white miso", "baby spinach", "boneless chicken thigh", "lemon juice", "extra virgin olive oil"). Leave out how it's prepared or used ("chopped", "freshly squeezed", "divided", "at room temperature", "for serving", "if you prefer it sweeter", "optional"), sizes ("large", "small") and amounts. Keep the product the recipe names: lemon juice stays lemon juice, not lemons. Name the same product the same way every time: "white miso paste" and "white miso" are both "white miso". When a list of items already in use comes with the names, use one of them for the same product.
- plural: the item written for more than one ("lemon" → "lemons", "garlic clove" → "garlic cloves", "star anise" → "star anise", "white miso" → "white miso").
- aisle: where a typical US supermarket keeps it. produce: fresh fruit, vegetables and herbs. meat: meat, poultry, fish and seafood. dairy: milk, cheese, eggs, butter, and the rest of the refrigerated case (tofu, miso, fresh pasta). bakery: bread, buns, tortillas. pantry: dry and canned goods, oils, vinegars, sauces, condiments, baking supplies, international foods. spices: dried herbs, spices, salt, pepper, seasoning blends. frozen: frozen foods and ice. drinks: drinks, wine and spirits. household: things that aren't food. other: none of these.
- onHand: true only for what nearly every kitchen always has, so nobody shops for it for one recipe: water, ice, salt, black pepper, a basic cooking oil, all-purpose flour, white sugar, baking soda, baking powder. Otherwise false.`;

/** Claude's answer: each name with its things. */
export const Named = z.object({
  names: z.array(
    z.object({
      name: z.string(),
      things: z.array(z.object({ item: z.string(), plural: z.string(), aisle: z.enum(AISLES), onHand: z.boolean() })),
    }),
  ),
});
export type Named = z.infer<typeof Named>;

/** The request to Claude: the names, one per line, after the items already in use (to name the same product alike). */
export function namingParams(names: string[], inUse: string[], model = DEFAULT_MODEL) {
  const known = inUse.length ? `Items already in use:\n${inUse.join('\n')}\n\n` : '';
  return {
    model,
    max_tokens: 16000,
    // sorting groceries needs little reasoning; low keeps the wait short
    output_config: { effort: 'low' as const, format: zodOutputFormat(Named) },
    system: SYSTEM,
    messages: [{ role: 'user' as const, content: `${known}Ingredient names:\n${names.join('\n')}` }],
  };
}

/** Why naming failed, for the person (the app then uses the general rules until it can try again). */
export class NamingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function namingFailure(e: unknown): NamingError {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new NamingError(503, 'Naming groceries isn’t set up on this site: Netlify’s AI Gateway didn’t accept the request.');
  if (e instanceof Anthropic.NotFoundError) return new NamingError(503, 'Naming groceries isn’t set up on this site: the AI model wasn’t found.');
  if (e instanceof Anthropic.RateLimitError) return new NamingError(429, 'Too many groceries named just now. Try again in a minute.');
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new NamingError(504, 'Claude took too long to answer.');
  if (e instanceof Anthropic.APIError) return new NamingError(502, 'Claude is busy right now.');
  return new NamingError(500, `Naming groceries failed: ${e instanceof Error ? e.message : String(e)}`);
}

/** Ask Claude about some names (at most BATCH); the answers it gave, as rows (a name it skipped is left out). */
export async function askClaude(
  names: string[],
  inUse: string[],
  client?: Anthropic,
  model = process.env.GROCERY_NAMES_MODEL || DEFAULT_MODEL,
): Promise<GroceryName[]> {
  if (!client && !process.env.ANTHROPIC_API_KEY) throw new NamingError(503, 'Naming groceries isn’t set up on this site: it needs Netlify’s AI Gateway.');
  const claude = client ?? new Anthropic({ timeout: 25_000, maxRetries: 1 });
  let message;
  try {
    message = await claude.messages.parse(namingParams(names, inUse, model));
  } catch (e) {
    throw namingFailure(e);
  }
  if (message.stop_reason === 'refusal' || !message.parsed_output) throw new NamingError(502, 'Claude didn’t name those groceries.');
  const wanted = new Set(names.map(nameOf));
  const rows: GroceryName[] = [];
  for (const n of message.parsed_output.names) {
    const key = nameOf(n.name);
    const things = n.things
      .slice(0, 4)
      .map((t) => GroceryThing.safeParse({ ...t, item: t.item.trim(), plural: t.plural.trim() || t.item.trim() }))
      .flatMap((r) => (r.success ? [r.data] : []));
    if (!wanted.has(key) || !things.length) continue;
    wanted.delete(key);
    rows.push({ key, things, by: 'claude' });
  }
  return rows;
}

type Row = { key: string; things: unknown; named_by: 'claude' | 'you' };
const toName = (r: Row): GroceryName | null => {
  const read = GroceryName.safeParse({ key: r.key, things: r.things, by: r.named_by });
  return read.success ? read.data : null;
};

// Each owner has names of their own (issue #146): '' is the admin's. Only the admin's are named by Claude; another
// owner's are only their corrections, and the app's rules stand in for the rest.

/** Every name the owner has so far. */
export async function listNames(sql: Sql, owner: string): Promise<GroceryName[]> {
  const rows = await sql<Row>`SELECT key, things, named_by FROM grocery_names WHERE owner_id = ${owner} ORDER BY key`;
  return rows.map(toName).filter((n): n is GroceryName => !!n);
}

/** The items already in use (to name the same product alike), at most this many. */
async function itemsInUse(sql: Sql, owner: string, limit = 600): Promise<string[]> {
  const rows = await sql<{ item: string }>`
    SELECT DISTINCT t->>'item' AS item FROM grocery_names, jsonb_array_elements(things) AS t WHERE owner_id = ${owner} ORDER BY 1 LIMIT ${limit}`;
  return rows.map((r) => r.item);
}

/** Keep Claude's answers, never over a name already there (Claude's earlier answer, or a correction). */
async function keep(sql: Sql, owner: string, rows: GroceryName[]) {
  for (const r of rows) {
    await sql`INSERT INTO grocery_names (owner_id, key, things, named_by) VALUES (${owner}, ${r.key}, ${JSON.stringify(r.things)}::jsonb, 'claude') ON CONFLICT (owner_id, key) DO NOTHING`;
  }
}

/**
 * What these ingredient names are: the ones known already, and the rest named by Claude now (in batches of BATCH) and
 * kept. Throws a NamingError if Claude can't be asked; names it has answered by then are kept.
 */
export async function nameIngredients(
  sql: Sql,
  owner: string,
  names: string[],
  ask: (names: string[], inUse: string[]) => Promise<GroceryName[]> = askClaude,
): Promise<GroceryName[]> {
  const byKey = new Map<string, string>();
  for (const n of names) if (nameOf(n) && !byKey.has(nameOf(n))) byKey.set(nameOf(n), n.trim());
  const keys = [...byKey.keys()];
  if (!keys.length) return [];
  const known = (await sql<Row>`SELECT key, things, named_by FROM grocery_names WHERE owner_id = ${owner} AND key = ANY(${keys}::text[])`)
    .map(toName)
    .filter((n): n is GroceryName => !!n);
  const missing = keys.filter((k) => !known.some((n) => n.key === k)).map((k) => byKey.get(k)!);
  const named: GroceryName[] = [];
  for (let i = 0; i < missing.length; i += BATCH) {
    const rows = await ask(missing.slice(i, i + BATCH), await itemsInUse(sql, owner));
    await keep(sql, owner, rows);
    named.push(...rows);
  }
  return [...known, ...named];
}

/** A correction from the phone (Same as…, Rename…): it replaces whatever was there, and Claude never overwrites it. */
export async function correctName(sql: Sql, owner: string, input: unknown): Promise<GroceryName> {
  const name = GroceryName.parse({ ...(input as object), by: 'you' });
  await sql`
    INSERT INTO grocery_names (owner_id, key, things, named_by, updated_at) VALUES (${owner}, ${name.key}, ${JSON.stringify(name.things)}::jsonb, 'you', now())
    ON CONFLICT (owner_id, key) DO UPDATE SET things = EXCLUDED.things, named_by = 'you', updated_at = now()`;
  return name;
}
