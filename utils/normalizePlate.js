/**
 * Convert a number plate to the format stored in MongoDB:
 * uppercase letters and digits only.
 *
 * "UP 32 AB 1234" -> "UP32AB1234"
 * "ka-01-mj-1234" -> "KA01MJ1234"
 */
export function normalizePlate(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
