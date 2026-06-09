/**
 * Map exclusive area (전용면적) to standard Korean apartment type name.
 */
export function getAreaType(exclusiveArea) {
  const area = Number(exclusiveArea);
  if (!area || area <= 0) return null;
  if (area <= 42) return '39';
  if (area <= 52) return '49';
  if (area <= 65) return '59';
  if (area <= 78) return '74';
  if (area <= 92) return '84';
  if (area <= 120) return '114';
  if (area <= 145) return '134';
  return '156';
}

/**
 * Extract sorted unique area types from a list of items with an area field.
 */
export function extractAreaTypes(items, areaField = 'area') {
  const types = new Set();
  for (const item of items) {
    const t = getAreaType(item[areaField]);
    if (t) types.add(t);
  }
  return [...types].sort((a, b) => Number(a) - Number(b));
}
