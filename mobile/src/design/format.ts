/** French decimal comma with fixed digits: 62.39 → "62,4". */
export function dec(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

/** Signed variant for discrepancies: -3.7 → "−3,7". */
export function signed(value: number, digits = 1): string {
  const body = dec(Math.abs(value), digits);
  return value > 0 ? `+${body}` : value < 0 ? `−${body}` : body;
}
