import { useMemo } from 'react';
import { getAreaType } from '../utils/areaType';

const formatEok = (v) => {
  if (v == null) return '—';
  const eok = v / 10000;
  return Number.isInteger(eok) ? `${eok}억` : `${eok.toFixed(1)}억`;
};

// "85,000" or "5억 5,000" style string → 만원 단위 number
function parsePriceToManwon(priceStr) {
  if (!priceStr) return null;
  const s = String(priceStr).replace(/,/g, '').trim();
  if (s.includes('억')) {
    const m = s.match(/(\d+(?:\.\d+)?)억\s*(\d+)?/);
    if (!m) return null;
    return Math.round(Number(m[1]) * 10000 + (m[2] ? Number(m[2]) : 0));
  }
  const num = Number(s);
  return isNaN(num) || num === 0 ? null : num;
}

function StatSummary({ txData, listings, areaType, txLoading, listingsLoading }) {
  const stats = useMemo(() => {
    // --- 실거래 (already filtered by areaType upstream) ---
    const txs = txData?.transactions || [];
    const lastTx = txs.length > 0 ? txs[txs.length - 1] : null;
    const prevTx = txs.length > 1 ? txs[txs.length - 2] : null;
    const delta = lastTx && prevTx ? lastTx.price - prevTx.price : null;
    const deltaPct = delta != null && prevTx.price > 0
      ? (delta / prevTx.price) * 100 : null;

    // --- 매물 (listings here = all listings; filter by area type) ---
    const inArea = listings.filter((l) => getAreaType(l.area) === areaType);
    const salePrices = inArea
      .filter((l) => l.tradeType === '매매')
      .map((l) => parsePriceToManwon(l.price))
      .filter((p) => p != null);
    const leasePrices = inArea
      .filter((l) => l.tradeType === '전세')
      .map((l) => parsePriceToManwon(l.price))
      .filter((p) => p != null);

    const minSale = salePrices.length ? Math.min(...salePrices) : null;
    const minLease = leasePrices.length ? Math.min(...leasePrices) : null;

    // 호가 갭: 매물 최저가 vs 최근 실거래가
    const gapPct = minSale != null && lastTx?.price > 0
      ? ((minSale - lastTx.price) / lastTx.price) * 100 : null;

    // 전세가율: 전세 최저 / 매매 최저
    const leaseRatio = minSale != null && minLease != null && minSale > 0
      ? (minLease / minSale) * 100 : null;

    return { lastTx, delta, deltaPct, minSale, minLease, gapPct, leaseRatio };
  }, [txData, listings, areaType]);

  const { lastTx, delta, deltaPct, minSale, gapPct, leaseRatio } = stats;
  const loading = txLoading || listingsLoading;

  if (loading) {
    return (
      <div className="stat-summary">
        {[0, 1, 2].map((i) => (
          <div className="stat-box" key={i}>
            <div className="skeleton skeleton-text" style={{ width: 56 }} />
            <div className="skeleton skeleton-title" style={{ width: 90 }} />
            <div className="skeleton skeleton-text" style={{ width: 70 }} />
          </div>
        ))}
      </div>
    );
  }

  if (!lastTx && minSale == null) return null;

  const deltaClass = delta == null || delta === 0
    ? 'delta-flat' : delta > 0 ? 'delta-up' : 'delta-down';
  const deltaArrow = delta == null || delta === 0 ? '' : delta > 0 ? '▲' : '▼';

  return (
    <div className="stat-summary">
      <div className="stat-box">
        <span className="stat-label">최근 실거래</span>
        <span className="stat-value">{lastTx ? formatEok(lastTx.price) : '—'}</span>
        {lastTx && (
          <span className="stat-sub">
            {lastTx.date.slice(2).replace(/-/g, '.')} · {lastTx.floor}층
            {delta != null && delta !== 0 && (
              <span className={deltaClass}>
                {' '}{deltaArrow} {formatEok(Math.abs(delta))}
                {deltaPct != null && ` (${Math.abs(deltaPct).toFixed(1)}%)`}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="stat-box">
        <span className="stat-label">매물 최저가</span>
        <span className="stat-value">{formatEok(minSale)}</span>
        <span className="stat-sub">
          {gapPct != null ? (
            <>
              실거래 대비{' '}
              <span className={gapPct > 0 ? 'delta-up' : gapPct < 0 ? 'delta-down' : 'delta-flat'}>
                {gapPct > 0 ? '+' : ''}{gapPct.toFixed(1)}%
              </span>
            </>
          ) : '매매 매물 없음'}
        </span>
      </div>

      <div className="stat-box">
        <span className="stat-label">전세가율</span>
        <span className="stat-value">
          {leaseRatio != null ? `${leaseRatio.toFixed(0)}%` : '—'}
        </span>
        <span className="stat-sub">
          {leaseRatio != null ? '전세 최저 ÷ 매매 최저' : '전세 매물 없음'}
        </span>
      </div>
    </div>
  );
}

export default StatSummary;
