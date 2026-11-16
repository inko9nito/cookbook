import { describe, expect, test } from 'vitest';
import { pendingChanges, upsert } from './pending';

type T = { id: string; v: number };

describe('changes under way', () => {
  test('a list read from the server keeps what was just made, changed or deleted', () => {
    const p = pendingChanges<T>();
    p.start('new', { id: 'new', v: 1 });
    p.start('a', { id: 'a', v: 9 });
    p.start('b', null);
    // the server's list, read before those saves landed
    expect(p.overlay([{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }])).toEqual([
      { id: 'a', v: 9 },
      { id: 'c', v: 1 },
      { id: 'new', v: 1 },
    ]);
  });

  test('the newest save counts, and it lasts until every save for that item has finished', () => {
    const p = pendingChanges<T>();
    p.start('a', { id: 'a', v: 1 });
    p.start('a', { id: 'a', v: 2 });
    expect(p.count('a')).toBe(2);
    expect(p.end('a')).toBe(1);
    expect(p.overlay([{ id: 'a', v: 0 }])).toEqual([{ id: 'a', v: 2 }]);
    expect(p.end('a')).toBe(0);
    expect(p.overlay([{ id: 'a', v: 0 }])).toEqual([{ id: 'a', v: 0 }]);
    expect(p.end('a')).toBe(0);
  });

  test('upsert replaces in place or adds at the end', () => {
    expect(upsert([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], { id: 'a', v: 2 })).toEqual([{ id: 'a', v: 2 }, { id: 'b', v: 1 }]);
    expect(upsert([{ id: 'a', v: 1 }], { id: 'c', v: 1 })).toEqual([{ id: 'a', v: 1 }, { id: 'c', v: 1 }]);
  });
});
