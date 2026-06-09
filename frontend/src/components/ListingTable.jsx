import { useState, useEffect } from 'react';
import { fetchListings } from '../api';

function ListingTable({ aptId, aptName }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchListings(aptId)
      .then((d) => setListings(d.listings || []))
      .catch(() => { setListings([]); setError(true); })
      .finally(() => setLoading(false));
  }, [aptId]);

  if (loading) return <div className="card loading">매물 로딩중...</div>;
  if (error) return (
    <div className="card">
      <h3>🏠 {aptName} 현재 매물</h3>
      <p className="empty-text">네이버 부동산 접속 제한으로 매물 정보를 불러올 수 없습니다</p>
    </div>
  );

  return (
    <div className="card">
      <h3>🏠 {aptName} 현재 매물 ({listings.length}건)</h3>
      {listings.length === 0 ? (
        <p className="empty-text">현재 등록된 매물이 없습니다</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>거래</th>
              <th>가격(만원)</th>
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
                  <span className={`trade-badge ${l.tradeType === '매매' ? 'sale' : l.tradeType === '전세' ? 'lease' : 'rent'}`}>
                    {l.tradeType}
                  </span>
                </td>
                <td className="price">{l.price}</td>
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
