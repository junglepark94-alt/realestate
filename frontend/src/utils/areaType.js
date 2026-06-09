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

export function toPyeong(sqm) {
  return Math.round(Number(sqm) / 3.3058);
}

export function areaLabel(sqm) {
  return `${Math.round(Number(sqm))}㎡(${toPyeong(sqm)}평)`;
}

export function areasWithPyeong(areasStr) {
  if (!areasStr) return '';
  return areasStr.replace(/(\d+(?:\.\d+)?)\s*㎡/g, (_, n) => `${Math.round(Number(n))}㎡(${toPyeong(n)}평)`);
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
