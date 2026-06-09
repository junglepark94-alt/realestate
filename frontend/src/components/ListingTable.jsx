/**
 * Convert 만원 price string to 억 format.
 * "132,000" → "13.2억"
 * "50,000" → "5.0억"
 * "8,000/190" (전세 보증금/월세) → "0.8억/190"
 */
function formatPriceToEok(priceStr) {
  if (!priceStr) return '';
  // Handle slash-separated prices (보증금/월세)
  if (priceStr.includes('/')) {
    const parts = priceStr.split('/');
    return parts.map(formatSinglePrice).join(' / ');
  }
  return formatSinglePrice(priceStr);
}

function formatSinglePrice(s) {
  const num = Number(s.replace(/,/g, ''));
  if (isNaN(num) || num === 0) return s;
  return `${(num / 10000).toFixed(1)}억`;
}

function ListingTable({ aptName, listings, loading, error }) {
  if (loading) return <div className="card loading">매물 로딩중...</div>;
  if (error) return (
    <div className="card">
      <h3>🏠 {aptName} 현재 매물</h3>
      <p className="empty-text">네이버 부동산 접속 제한으로 매물 정보를 불러올 수 없습니다</p>
    </div>
  );

  return (
    <div className="card">
      <h3>🏠 {aptName} 매매/전세 매물 ({listings.length}건)</h3>
      {listings.length === 0 ? (
        <p className="empty-text">해당 면적의 매매/전세 매물이 없습니다</p>
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
            {listings.map((l) => (
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
