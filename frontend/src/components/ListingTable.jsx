import { useState, useMemo } from 'react';
import { areaLabel } from '../utils/areaType';

function formatPriceToEok(priceStr) {
  if (!priceStr) return '';
  if (priceStr.includes('/')) {
    return priceStr.split('/').map(formatSinglePrice).join(' / ');
  }
  return formatSinglePrice(priceStr);
}

function formatSinglePrice(s) {
  const num = Number(s.replace(/,/g, ''));
  if (isNaN(num) || num === 0) return s;
  return `${(num / 10000).toFixed(1)}억`;
}

const TRADE_TABS = [
  { key: '매매', label: '매매' },
  { key: '전세', label: '전세' },
  { key: 'all', label: '전체' },
];

function ListingTable({ aptName, listings, loading, error }) {
  const [tradeFilter, setTradeFilter] = useState('매매');
  const [popupText, setPopupText] = useState(null);

  const filtered = useMemo(() => {
    if (tradeFilter === 'all') return listings;
    return listings.filter((l) => l.tradeType === tradeFilter);
  }, [listings, tradeFilter]);

  const counts = useMemo(() => {
    const m = { all: listings.length, '매매': 0, '전세': 0 };
    for (const l of listings) {
      if (l.tradeType === '매매') m['매매']++;
      else if (l.tradeType === '전세') m['전세']++;
    }
    return m;
  }, [listings]);

  if (loading) {
    return (
      <div className="card">
        <div className="skeleton skeleton-title" style={{ width: 130, marginBottom: 18 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="skeleton skeleton-row" key={i} />
        ))}
      </div>
    );
  }
  if (error) return (
    <div className="card">
      <h3>현재 매물</h3>
      <p className="empty-text">네이버 부동산 접속 제한으로 매물 정보를 불러올 수 없습니다</p>
    </div>
  );

  return (
    <div className="card listing-card">
      <div className="listing-header">
        <h3>매매/전세 매물</h3>
        <div className="trade-filter">
          {TRADE_TABS.map((t) => (
            <button
              key={t.key}
              className={`trade-tab ${tradeFilter === t.key ? 'active' : ''}`}
              onClick={() => setTradeFilter(t.key)}
            >
              {t.label}
              <span className="trade-count">{counts[t.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-text">해당 조건의 매물이 없습니다</p>
      ) : (
        <div className="listing-list">
          {filtered.map((l) => (
            <div
              key={l.articleNo}
              className="listing-row"
              onClick={() => l.articleFeatureDesc && setPopupText(l.articleFeatureDesc)}
            >
              <div className="listing-main">
                <span className="listing-price price">{formatPriceToEok(l.price)}</span>
                <span className={`trade-badge ${l.tradeType === '매매' ? 'sale' : 'lease'}`}>
                  {l.tradeType}
                </span>
              </div>
              <div className="listing-meta">
                <span>{l.area ? areaLabel(l.area) : ''}</span>
                <span className="dot" />
                <span>{l.building ? `${l.building} ` : ''}{l.floor}</span>
                <span className="dot" />
                <span>{l.articleConfirmYmd}</span>
                {l.articleFeatureDesc && <span className="listing-has-desc">i</span>}
                <a
                  href={/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
                    ? `https://m.land.naver.com/article/info/${l.articleNo}`
                    : `https://new.land.naver.com/article/${l.articleNo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="listing-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  네이버
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Feature popup overlay */}
      {popupText && (
        <div className="popup-overlay" onClick={() => setPopupText(null)}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <span>매물 특징</span>
              <button className="popup-close" onClick={() => setPopupText(null)}>&times;</button>
            </div>
            <p>{popupText}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ListingTable;
