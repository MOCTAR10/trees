/** French decimal comma with fixed digits: 62.39 → "62,4". */
export function dec(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

/** Signed variant for discrepancies: -3.7 → "−3,7". */
export function signed(value: number, digits = 1): string {
  const body = dec(Math.abs(value), digits);
  return value > 0 ? `+${body}` : value < 0 ? `−${body}` : body;
}

/** ISO date or timestamp → French date: "2026-10-14…" → "14/10/2026" (empty when missing). */
export function frDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/** A form label without its input hint: "Valable du (AAAA-MM-JJ)" → "Valable du". */
export function shown(label: string): string {
  return label.replace(/\s*\(AAAA-MM-JJ\)/, "");
}
