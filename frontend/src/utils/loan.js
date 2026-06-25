/**
 * 주택담보대출 시뮬레이션 계산. 모든 금액 단위는 만원.
 *
 * 투기과열지구(규제지역) 무주택 기준 LTV 구간:
 *   - 9억(90,000만원) 이하분 40%
 *   - 9억 초과 ~ 15억(150,000만원) 이하분 20%
 *   - 15억 초과분 0%
 * 생애최초: 지역·가격 무관 LTV 80%, 한도 6억(60,000만원).
 */
export const LTV_RULES = {
  regular: {
    tier1Limit: 90000, tier1: 0.40,   // 9억 이하 40%
    tier2Limit: 150000, tier2: 0.20,  // 9~15억 20% (초과분 0%)
  },
  firstHome: { ltv: 0.80, cap: 60000 }, // 생애최초 LTV 80%, 한도 6억
};

/** 투기과열지구 LTV 규칙으로 최대 대출 가능액(만원)을 구한다. */
export function maxLoan(priceManwon, { firstHome = false } = {}) {
  const p = Math.max(0, Number(priceManwon) || 0);
  if (firstHome) {
    const { ltv, cap } = LTV_RULES.firstHome;
    return Math.min(Math.round(p * ltv), cap);
  }
  const { tier1Limit, tier1, tier2Limit, tier2 } = LTV_RULES.regular;
  const t1 = Math.min(p, tier1Limit) * tier1;
  const t2 = Math.min(Math.max(p - tier1Limit, 0), tier2Limit - tier1Limit) * tier2;
  return Math.round(t1 + t2);
}

/** 집값 대비 실효 LTV(%) */
export function effectiveLtv(priceManwon, loanManwon) {
  const p = Number(priceManwon) || 0;
  if (p <= 0) return 0;
  return (Number(loanManwon) / p) * 100;
}

/** 원리금균등 월 상환액(만원). principal·반환값 단위는 만원. */
export function monthlyPayment(principalManwon, annualRatePct, years) {
  const P = Math.max(0, Number(principalManwon) || 0);
  const n = Math.max(1, Math.round((Number(years) || 0) * 12));
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  if (P === 0) return 0;
  if (r === 0) return P / n;
  const f = Math.pow(1 + r, n);
  return (P * r * f) / (f - 1);
}

/** 원리금균등 상환 요약: 월 상환액·총 상환액·총 이자(만원). */
export function amortizationSummary(principalManwon, annualRatePct, years) {
  const monthly = monthlyPayment(principalManwon, annualRatePct, years);
  const months = Math.max(1, Math.round((Number(years) || 0) * 12));
  const totalPayment = monthly * months;
  const totalInterest = totalPayment - (Math.max(0, Number(principalManwon) || 0));
  return { monthly, totalPayment, totalInterest, months };
}
