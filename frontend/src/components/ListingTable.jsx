import { useState, useMemo } from 'react';

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
  { key: 'all', label: '전체' },
  { key: '매매', label: '매매' },
  { key: '전세', label: '전세' },
];

function ListingTable({ aptName, listings, loading, error }) {
  const [tradeFilter, setTradeFilter] = useState('all');

  const filtered = useMemo(() => {
    if (tradeFilter === 'all') return listings;
    return listings.filter((l) => l.tradeType === tradeFilter);
  }, [listings, tradeFilter]);

  // Count per trade type for badge numbers
  const counts = useMemo(() => {
    const m = { all: listings.length, '매매': 0, '전세': 0 };
    for (const l of listings) {
      if (l.tradeType === '매매') m['매매']++;
      else if (l.tradeType === '전세') m['전세']++;
    }
    return m;
  }, [listings]);

  if (loading) return <div className="card loading">매물 로딩중...</div>;
  if (error) return (
    <div className="card">
      <h3>현재 매물</h3>
      <p className="empty-text">네이버 부동산 접속 제한으로 매물 정보를 불러올 수 없습니다</p>
    </div>
  );

  return (
    <div className="card">
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
        <table>
          <thead>
            <tr>
              <th>거래</th>
              <th>가격</th>
              <th>면적(㎡)</th>
              <th>동/층</th>
              <th>확인일</th>
              <th>특징</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.articleNo}>
                <td>
                  <span className={`trade-badge ${l.tradeType === '매매' ? 'sale' : 'lease'}`}>
                    {l.tradeType}
                  </span>
                </td>
                <td className="price">{formatPriceToEok(l.price)}</td>
                <td>{l.area ? `${Number(l.area).toFixed(1)}` : ''}{l.areaSupply ? ` / ${Number(l.areaSupply).toFixed(1)}` : ''}</td>
                <td>{l.building ? `${l.building} ` : ''}{l.floor}</td>
                <td>{l.articleConfirmYmd}</td>
                <td className="feature">{l.articleFeatureDesc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ListingTable;
