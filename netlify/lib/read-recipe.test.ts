import { describe, expect, test } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, JOB_LIMIT_MS, PAGE_SYSTEM, ReadError, jobStatus, readFailure, readParams, readRecipe, runJob, startJob, type Jobs } from './read-recipe';
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

describe('readParams for a page (issue #15)', () => {
  test('the page’s text, with the page instructions', () => {
    const p = readParams({ page: { url: 'https://example.com/', text: 'Address: https://example.com/\n\n2 eggs' } });
    expect(p.system).toBe(PAGE_SYSTEM);
    expect(p.messages[0].content).toBe('Address: https://example.com/\n\n2 eggs\n\n---\nCopy the recipe from this page.');
  });

  test('failures speak of the page', () => {
    expect(readFailure(new Error('x'), true).message).toBe('Reading the page failed: x');
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

describe('reading as a job', () => {
  /** a Map standing in for the Blobs store */
  const store = () => {
    const m = new Map<string, unknown>();
    const jobs: Jobs = {
      get: async (k) => m.get(k) ?? null,
      setJSON: async (k, v) => void m.set(k, structuredClone(v)),
      delete: async (k) => void m.delete(k),
    };
    return { m, jobs };
  };
  const withKey = async (fn: () => Promise<void>) => {
    const before = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'gateway';
    try {
      await fn();
    } finally {
      if (before === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = before;
    }
  };

  test('start → reading → done once; the photos and then the result are deleted', () => withKey(async () => {
    const { m, jobs } = store();
    const id = await startJob(jobs, { images: [img] }, 1000);
    expect(await jobStatus(jobs, id, 2000)).toEqual({ status: 'reading' });
    await runJob(jobs, id, async () => recipe);
    expect(m.has(`${id}/request`)).toBe(false);
    expect(await jobStatus(jobs, id)).toEqual({ status: 'done', recipe });
    expect(await jobStatus(jobs, id)).toBeNull();
  }));

  test('a page’s reading hands back its address and photo', () => withKey(async () => {
    const { m, jobs } = store();
    const id = await startJob(jobs, { page: { url: 'https://example.com/r', text: 'Pie', photo: 'data:image/jpeg;base64,AA' } });
    let asked: unknown;
    await runJob(jobs, id, async (req) => ((asked = req), recipe));
    expect(asked).toMatchObject({ page: { text: 'Pie' } });
    expect(m.has(`${id}/request`)).toBe(false);
    expect(await jobStatus(jobs, id)).toEqual({ status: 'done', recipe, url: 'https://example.com/r', photo: 'data:image/jpeg;base64,AA' });
  }));

  test('a failed reading keeps its message and status', () => withKey(async () => {
    const { jobs } = store();
    const id = await startJob(jobs, { images: [img] });
    await runJob(jobs, id, async () => { throw new ReadError(429, 'Too many.'); });
    expect(await jobStatus(jobs, id)).toEqual({ status: 'failed', code: 429, error: 'Too many.' });
    const id2 = await startJob(jobs, { images: [img] });
    await runJob(jobs, id2, async () => { throw new Error('boom'); });
    expect(await jobStatus(jobs, id2)).toMatchObject({ status: 'failed', code: 500 });
  }));

  test('a reading that never finishes fails after the limit', () => withKey(async () => {
    const { m, jobs } = store();
    const id = await startJob(jobs, { images: [img] }, 0);
    expect(await jobStatus(jobs, id, JOB_LIMIT_MS + 1)).toMatchObject({ status: 'failed', code: 504 });
    expect(m.size).toBe(0);
  }));

  test('without the AI Gateway, nothing is started', async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { m, jobs } = store();
      await expect(startJob(jobs, { images: [img] })).rejects.toMatchObject({ status: 503 });
      expect(m.size).toBe(0);
    } finally {
      if (before !== undefined) process.env.ANTHROPIC_API_KEY = before;
    }
  });

  test('an unknown or already-run job does nothing', async () => {
    const { m, jobs } = store();
    await runJob(jobs, 'nope', async () => recipe);
    expect(m.size).toBe(0);
    expect(await jobStatus(jobs, 'nope')).toBeNull();
  });
});
