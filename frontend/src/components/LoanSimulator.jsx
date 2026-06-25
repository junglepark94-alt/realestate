import { useState, useEffect, useMemo } from 'react';
import { maxLoan, effectiveLtv, amortizationSummary } from '../utils/loan';

const TERMS = [10, 15, 20, 30, 40];
// 현재 시중은행 주택담보대출 평균 금리(신규취급액 기준) 근사치 — 입력으로 조정 가능
const DEFAULT_RATE = 4.2;
const LOAN_STEP = 1000; // 슬라이더 단위: 1,000만원(0.1억)

// 만원 → "X.X억" (정수면 소수점 생략)
const eok = (manwon) => {
  const v = (Number(manwon) || 0) / 10000;
  return Number.isInteger(v) ? `${v}억` : `${v.toFixed(2).replace(/0$/, '').replace(/\.$/, '')}억`;
};
// 만원 → "1,234,000원"
const won = (manwon) =>
  `${Math.round((Number(manwon) || 0) * 10000).toLocaleString('ko-KR')}원`;
const manwonComma = (manwon) => Math.round(Number(manwon) || 0).toLocaleString('ko-KR');

function LoanSimulator({ defaultPrice, areaType }) {
  const [priceInput, setPriceInput] = useState(defaultPrice ? String(defaultPrice) : '');
  const [firstHome, setFirstHome] = useState(false);
  const [rate, setRate] = useState(String(DEFAULT_RATE));
  const [years, setYears] = useState(30);
  const [loan, setLoan] = useState(0);

  const price = Math.max(0, Number(priceInput) || 0);

  // 단지·면적이 바뀌면(=defaultPrice 변경) 집값을 자동 실거래가로 리셋
  useEffect(() => {
    setPriceInput(defaultPrice ? String(defaultPrice) : '');
  }, [defaultPrice, areaType]);

  const maxAvailable = useMemo(() => maxLoan(price, { firstHome }), [price, firstHome]);

  // 한도가 바뀌면 대출금을 최대치로 맞춤(집값·생애최초 변경 시). 금리/기간은 영향 없음.
  useEffect(() => {
    setLoan(maxAvailable);
  }, [maxAvailable]);

  const loanClamped = Math.min(loan, maxAvailable);
  const cashNeeded = Math.max(0, price - loanClamped);
  const ltvPct = effectiveLtv(price, loanClamped);
  const { monthly, totalPayment, totalInterest } = useMemo(
    () => amortizationSummary(loanClamped, rate, years),
    [loanClamped, rate, years]
  );

  return (
    <div className="card loan-sim">
      <div className="loan-head">
        <h3>대출 시뮬레이션</h3>
        <div className="loan-mode">
          <button
            className={`loan-mode-btn ${!firstHome ? 'active' : ''}`}
            onClick={() => setFirstHome(false)}
          >
            일반
          </button>
          <button
            className={`loan-mode-btn ${firstHome ? 'active' : ''}`}
            onClick={() => setFirstHome(true)}
          >
            생애최초
          </button>
        </div>
      </div>

      <p className="loan-rule">
        {firstHome
          ? '생애최초 · LTV 80% (한도 6억)'
          : '투기과열지구 · 9억 이하 40% + 9~15억 20%'}
      </p>

      {/* 입력 */}
      <div className="loan-inputs">
        <label className="loan-field">
          <span>집값(만원)</span>
          <input
            type="number"
            inputMode="numeric"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder="집값 입력"
          />
          <small>{price > 0 ? eok(price) : '최근 실거래가 없음'}</small>
        </label>

        <label className="loan-field">
          <span>금리(%)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <small>주담대 평균</small>
        </label>

        <label className="loan-field">
          <span>기간</span>
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {TERMS.map((t) => (
              <option key={t} value={t}>{t}년</option>
            ))}
          </select>
          <small>원리금균등</small>
        </label>
      </div>

      {price <= 0 ? (
        <p className="empty-text">집값을 입력하면 대출 한도와 월 상환액을 계산합니다</p>
      ) : (
        <>
          {/* 대출금 조절 */}
          <div className="loan-slider-row">
            <div className="loan-slider-label">
              <span>대출금</span>
              <strong>{eok(loanClamped)}</strong>
              <span className="loan-ltv">LTV {ltvPct.toFixed(0)}%</span>
              <button
                className="loan-max-btn"
                onClick={() => setLoan(maxAvailable)}
                disabled={loanClamped === maxAvailable}
              >
                최대
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={maxAvailable}
              step={LOAN_STEP}
              value={loanClamped}
              onChange={(e) => setLoan(Number(e.target.value))}
            />
            <div className="loan-slider-foot">
              <span>0</span>
              <span>최대 {eok(maxAvailable)}</span>
            </div>
          </div>

          {/* 결과 */}
          <div className="loan-results">
            <div className="loan-result-box highlight">
              <span className="loan-result-label">월 상환액</span>
              <span className="loan-result-value">{manwonComma(monthly)}만원</span>
              <span className="loan-result-sub">{won(monthly)} · {years}년</span>
            </div>
            <div className="loan-result-box">
              <span className="loan-result-label">필요 현금</span>
              <span className="loan-result-value">{eok(cashNeeded)}</span>
              <span className="loan-result-sub">집값 − 대출금</span>
            </div>
            <div className="loan-result-box">
              <span className="loan-result-label">총 이자</span>
              <span className="loan-result-value">{eok(totalInterest)}</span>
              <span className="loan-result-sub">총 상환 {eok(totalPayment)}</span>
            </div>
          </div>

          <p className="loan-note">
            전용 {areaType}㎡ 기준 · 무주택·담보(LTV)만 반영(DSR·소득 미적용) · 취득세·중개수수료 별도 ·
            실제 한도·금리는 은행·개인 조건에 따라 다릅니다
          </p>
        </>
      )}
    </div>
  );
}

export default LoanSimulator;
