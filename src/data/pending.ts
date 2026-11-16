// Changes on their way to the server (issue #25). A list reloaded from the server can come back before them: opening a
// page reloads data that has gone stale, and a save can take seconds (a recipe's photos upload first). Read as is, that
// list would drop a cookbook or recipe just made, or undo a change, until the next reload; a page showing it would
// flip to "not found" and back. So every list read from the server has the changes still under way laid over it.

type Item = { id: string };

export type Pending<T extends Item> = {
  /** a save (the item as saved) or a delete (null) has started */
  start: (id: string, item: T | null) => void;
  /** it has finished (or failed); returns how many for that id are still under way */
  end: (id: string) => number;
  /** how many for that id are under way */
  count: (id: string) => number;
  /** the list with the changes under way laid over it: saved ones replaced or added, deleted ones left out */
  overlay: (list: T[]) => T[];
};

/** Replace the item with the same id, or add it at the end. */
export const upsert = <T extends Item>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export function pendingChanges<T extends Item>(): Pending<T> {
  const under = new Map<string, { item: T | null; count: number }>();
  return {
    start: (id, item) => under.set(id, { item, count: (under.get(id)?.count ?? 0) + 1 }),
    end: (id) => {
      const p = under.get(id);
      if (!p || p.count <= 1) {
        under.delete(id);
        return 0;
      }
      p.count -= 1;
      return p.count;
    },
    count: (id) => under.get(id)?.count ?? 0,
    overlay: (list) => [...under].reduce((out, [id, { item }]) => (item ? upsert(out, item) : out.filter((x) => x.id !== id)), list),
  };
}
