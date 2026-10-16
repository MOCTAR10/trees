// Strip diacritics so "Ébène" groups under E and matches "ebene".
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Sorts by text without Intl: one key per item, plain comparisons (Intl is very slow on Hermes/Android). */
export function sortByText<T>(items: readonly T[], key: (item: T) => string): T[] {
  return items
    .map((item) => ({ k: normalize(key(item)), item }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((d) => d.item);
}
