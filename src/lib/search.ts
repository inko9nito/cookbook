// Searching recipes by title (Recipes, a cookbook, the recipe pickers): every word typed must appear in the title,
// ignoring case and accents ("puree" finds "Purée").

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The words of a search; none when it's empty. */
export const searchWords = (query: string) => fold(query).split(/\s+/).filter(Boolean);

/** The items whose title has every word (all of them when there are no words). */
export const searchByTitle = <T extends { title: string }>(items: T[], words: string[]) =>
  words.length ? items.filter((r) => words.every((w) => fold(r.title).includes(w))) : items;
