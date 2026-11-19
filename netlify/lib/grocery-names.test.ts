import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { DEFAULT_MODEL, NamingError, askClaude, correctName, listNames, nameIngredients, namingParams, type Named } from './grocery-names';
import type { GroceryName } from '../../src/lib/grocery-names';

// Runs the real migrations on a local Postgres, with a stand-in for Claude.
let local: NetlifyDB;
let db: ReturnType<typeof getDatabase>;

beforeAll(async () => {
  local = new NetlifyDB();
  const connectionString = await local.start();
  await local.applyMigrations('./netlify/database/migrations');
  db = getDatabase({ connectionString });
}, 60_000);

afterAll(async () => {
  await db?.pool.end();
  await local?.stop();
});

const thing = (item: string, aisle: GroceryName['things'][number]['aisle'] = 'pantry', onHand = false) => ({ item, plural: item, aisle, onHand });

/** A stand-in for the SDK client: records the requests, answers with these names. */
const fakeClient = (answer: Named | Error, stop = 'end_turn') => {
  const sent: ReturnType<typeof namingParams>[] = [];
  const client = {
    messages: {
      parse: async (params: ReturnType<typeof namingParams>) => {
        sent.push(params);
        if (answer instanceof Error) throw answer;
        return { stop_reason: stop, parsed_output: answer };
      },
    },
  } as unknown as Anthropic;
  return { client, sent };
};

describe('asking Claude', () => {
  test('the names one per line, after the items already in use; a small model, structured output', () => {
    const p = namingParams(['white miso paste', 'soy sauce or tamari'], ['white miso']);
    expect(p.model).toBe(DEFAULT_MODEL);
    expect(p.messages[0].content).toBe('Items already in use:\nwhite miso\n\nIngredient names:\nwhite miso paste\nsoy sauce or tamari');
    expect(p.output_config.format.type).toBe('json_schema');
  });

  test('answers are matched to the names asked about; a name not asked about, or with nothing to buy, is left out', async () => {
    const { client } = fakeClient({
      names: [
        { name: 'White Miso Paste', things: [{ item: 'white miso', plural: 'white miso', aisle: 'dairy', onHand: false }] },
        { name: 'soy sauce or tamari', things: [thing('soy sauce'), thing('tamari')] },
        { name: 'something else', things: [thing('x')] },
        { name: 'water', things: [] },
      ],
    });
    const rows = await askClaude(['white miso paste', 'soy sauce or tamari', 'water'], [], client);
    expect(rows.map((r) => [r.key, r.things.map((t) => t.item).join(' | ')])).toEqual([
      ['white miso paste', 'white miso'],
      ['soy sauce or tamari', 'soy sauce | tamari'],
    ]);
  });

  test('a refusal or a failure is a NamingError (the app uses its rules meanwhile)', async () => {
    await expect(askClaude(['x'], [], fakeClient({ names: [] }, 'refusal').client)).rejects.toBeInstanceOf(NamingError);
    await expect(askClaude(['x'], [], fakeClient(new Error('down')).client)).rejects.toBeInstanceOf(NamingError);
  });
});

describe('the names in the database', () => {
  test('each name is asked about once; known names come from the table', async () => {
    const asked: string[][] = [];
    const ask = async (names: string[], inUse: string[]) => {
      asked.push([...names, `in use: ${inUse.join(',')}`]);
      return names.map((n) => ({ key: n.toLowerCase(), things: [thing(n.toLowerCase().replace(' paste', ''), 'dairy')], by: 'claude' as const }));
    };
    const first = await nameIngredients(db.sql, ['White miso paste', 'white miso paste', '  '], ask);
    expect(first.map((n) => n.key)).toEqual(['white miso paste']);
    const second = await nameIngredients(db.sql, ['white miso paste', 'white miso'], ask);
    expect(second.map((n) => n.key).sort()).toEqual(['white miso', 'white miso paste']);
    expect(asked).toEqual([['White miso paste', 'in use: '], ['white miso', 'in use: white miso']]);
  });

  test('a correction replaces Claude’s answer and Claude never overwrites it', async () => {
    await correctName(db.sql, { key: 'white miso', things: [thing('miso', 'dairy')] });
    await nameIngredients(db.sql, ['white miso'], async () => {
      throw new Error('should not be asked');
    });
    const all = await listNames(db.sql);
    expect(all.find((n) => n.key === 'white miso')).toEqual({ key: 'white miso', things: [thing('miso', 'dairy')], by: 'you' });
  });
});
