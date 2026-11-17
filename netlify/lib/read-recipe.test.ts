import { describe, expect, test } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, ReadError, readFailure, readParams, readRecipe } from './read-recipe';
import type { ReadRecipe } from '../../src/lib/read-recipe';

const img = { data: 'data:image/jpeg;base64,AAAA', width: 720, height: 1568 };
const recipe: ReadRecipe = {
  found: true, title: 'Toast', source: '', servings: 1, servingSize: '', prepMinutes: null, cookMinutes: 2,
  ingredients: [{ group: '', lines: ['1 slice bread'] }], directions: [{ group: '', steps: ['Toast it.'] }], notes: '', dishPhoto: null,
};

/** A stand-in for the SDK client: records the request, answers with a message. */
const fakeClient = (answer: Partial<{ stop_reason: string; parsed_output: ReadRecipe | null }> | Error) => {
  const sent: unknown[] = [];
  const client = {
    messages: {
      parse: async (params: unknown) => {
        sent.push(params);
        if (answer instanceof Error) throw answer;
        return { stop_reason: 'end_turn', parsed_output: recipe, ...answer };
      },
    },
  } as unknown as Anthropic;
  return { client, sent };
};

describe('readParams', () => {
  test('each image follows a line with its number and size; the data URL prefix is dropped', () => {
    const p = readParams({ images: [img, { ...img, width: 1568, height: 1176 }] });
    expect(p.model).toBe(DEFAULT_MODEL);
    const content = p.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content.map((c) => c.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect((content[2] as Anthropic.TextBlockParam).text).toBe('Image 1: 1568×1176 pixels');
    expect((content[1] as Anthropic.ImageBlockParam).source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'AAAA' });
    expect(p.output_config.format.type).toBe('json_schema');
  });
});

describe('readRecipe', () => {
  test('returns the parsed recipe', async () => {
    const { client, sent } = fakeClient({});
    expect(await readRecipe({ images: [img] }, client, 'some-model')).toEqual(recipe);
    expect((sent[0] as { model: string }).model).toBe('some-model');
  });

  test('a refusal, a cut-off answer, or images too large become messages for the person', async () => {
    await expect(readRecipe({ images: [img] }, fakeClient({ stop_reason: 'refusal', parsed_output: null }).client)).rejects.toMatchObject({ status: 422 });
    await expect(readRecipe({ images: [img] }, fakeClient({ stop_reason: 'max_tokens', parsed_output: null }).client)).rejects.toMatchObject({ status: 502 });
    const huge = { ...img, data: `data:image/jpeg;base64,${'A'.repeat(5_000_001)}` };
    await expect(readRecipe({ images: [huge] }, fakeClient({}).client)).rejects.toMatchObject({ status: 413 });
  });

  test('without the AI Gateway (no key), it says reading isn’t set up', async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(readRecipe({ images: [img] })).rejects.toMatchObject({ status: 503 });
    } finally {
      if (before !== undefined) process.env.ANTHROPIC_API_KEY = before;
    }
  });

  test('SDK errors map to statuses', async () => {
    const err = (status: number) => Anthropic.APIError.generate(status, { error: { message: 'x' } }, 'x', new Headers());
    expect(readFailure(err(401)).status).toBe(503);
    expect(readFailure(err(429)).status).toBe(429);
    expect(readFailure(err(529)).status).toBe(502);
    expect(readFailure(new Error('boom'))).toBeInstanceOf(ReadError);
    await expect(readRecipe({ images: [img] }, fakeClient(err(429)).client)).rejects.toMatchObject({ status: 429 });
  });
});
