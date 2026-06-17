/**
 * Map exclusive area (전용면적) to standard Korean apartment type name.
 * Grouping/filtering stays keyed on 전용 because the public transaction API
 * (RTMS) only provides 전용 — it is the one field shared with listings.
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
 * Representative 공급면적(㎡) for each 전용 type — standard Korean 평형 table.
 * Used to DISPLAY areas in 공급 even where only 전용 data exists (실거래/RTMS).
 * Actual 공급 per complex varies ±1~2㎡ (전용률 차이).
 */
const SUPPLY_BY_TYPE = {
  '39': 52,
  '49': 66,
  '59': 80,
  '74': 99,
  '84': 113,
  '114': 151,
  '134': 178,
  '156': 198,
};

export function toPyeong(sqm) {
  return Math.round(Number(sqm) / 3.3058);
}

/** Format a real 공급면적(㎡) value, e.g. listing size1. */
export function supplyLabel(supplySqm) {
  const n = Math.round(Number(supplySqm));
  if (!n) return '';
  return `${n}㎡(${toPyeong(n)}평)`;
}

/**
 * Label for a 전용 area or area-type — rendered in 공급면적 via the standard
 * 평형 table. Accepts either a raw 전용 ㎡ (e.g. 59.4) or a type string ('59').
 */
export function areaLabel(exclusiveAreaOrType) {
  const type = getAreaType(exclusiveAreaOrType);
  const supply = type ? SUPPLY_BY_TYPE[type] : null;
  if (!supply) return '';
  return `${supply}㎡(${toPyeong(supply)}평)`;
}

/** Convert a "59㎡, 84㎡" (전용) config string into 공급면적 labels. */
export function areasWithPyeong(areasStr) {
  if (!areasStr) return '';
  return areasStr.replace(/(\d+(?:\.\d+)?)\s*㎡/g, (_, n) => {
    const type = getAreaType(n);
    const supply = type ? SUPPLY_BY_TYPE[type] : null;
    return supply ? `${supply}㎡(${toPyeong(supply)}평)` : `${Math.round(Number(n))}㎡`;
  });
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
