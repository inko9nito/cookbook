// /api/read-recipe: read a recipe from photos or screenshots (issue #17).
// POST { images: [{ data, width, height }] } (JPEG data URLs, shrunk on the phone) keeps the photos and starts the
// background function that reads them (read-recipe-background.mts: reading can take longer than the 30 seconds this
// function gets) → 202 { id }. GET /api/read-recipe/:id → { status: 'reading' | 'done' (with the recipe) | 'failed' }.
// The photos are deleted once read, the result once the phone has it. Admin only: every read is billed to Netlify.

import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { ReadRequest } from '../../src/lib/read-recipe';
import { ReadError, jobStatus, startJob } from '../lib/read-recipe';
import { error, json, refuseUnlessAdmin } from '../lib/http';

export default async (req: Request, context: Context) => {
  const refused = await refuseUnlessAdmin(req);
  if (refused) return refused;
  // strong: the phone asks for the result a moment after it's written
  const jobs = getStore({ name: 'reads', consistency: 'strong' });
  const id = context.params.id;

  if (req.method === 'GET' && id) {
    const status = await jobStatus(jobs, id);
    return status ? json(status) : error(404, 'That reading is gone. Try again.');
  }

  if (req.method === 'POST' && !id) {
    let body: ReadRequest;
    try {
      body = ReadRequest.parse(await req.json());
    } catch {
      return error(400, 'Send one to four photos to read.');
    }
    let jobId: string;
    try {
      jobId = await startJob(jobs, body);
    } catch (e) {
      if (e instanceof ReadError) return error(e.status, e.message);
      throw e;
    }
    // a background function answers 202 at once and carries on reading; it checks the same sign-in
    const started = await fetch(new URL('/.netlify/functions/read-recipe-background', req.url), {
      method: 'POST',
      headers: { authorization: req.headers.get('authorization') ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ id: jobId }),
    }).catch(() => null);
    if (!started || started.status !== 202) {
      await jobs.delete(`${jobId}/request`);
      await jobs.delete(`${jobId}/status`);
      return error(502, 'Reading the photo couldn’t be started. Try again.');
    }
    return json({ id: jobId }, 202);
  }

  return error(405, 'Not allowed.');
};

export const config: Config = { path: ['/api/read-recipe', '/api/read-recipe/:id'] };
