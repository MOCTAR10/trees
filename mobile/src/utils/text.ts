// Strip diacritics so "Ébène" groups under E and matches "ebene".
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
