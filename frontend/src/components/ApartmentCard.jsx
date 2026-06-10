import { areasWithPyeong } from '../utils/areaType';

function ApartmentCard({ apartment, dealCount, leaseCount, listingsLoading }) {
  const info = apartment.naverInfo;

  return (
    <div className="apt-card">
      <div className="apt-card-header">
        <div className="apt-card-title">
          <h2>{apartment.name}</h2>
          <span className="apt-location">{apartment.gu} {apartment.dong}</span>
        </div>
        <img
          className="apt-photo"
          src={`/apt/${apartment.id}.jpg`}
          alt={apartment.name}
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </div>
      {info ? (
        <div className="apt-card-body">
          <div className="apt-stat">
            <span className="label">주소</span>
            <span className="value">{info.address}</span>
          </div>
          <div className="apt-stat">
            <span className="label">세대수</span>
            <span className="value">{info.totalHouseholdCount}세대</span>
          </div>
          {(info.highFloor || info.lowFloor) && (
            <div className="apt-stat">
              <span className="label">층수</span>
              <span className="value">{info.lowFloor}~{info.highFloor}층</span>
            </div>
          )}
          <div className="apt-stat">
            <span className="label">입주</span>
            <span className="value">{info.useApproveYmd}</span>
          </div>
          {info.builder && (
            <div className="apt-stat">
              <span className="label">건설사</span>
              <span className="value">{info.builder}</span>
            </div>
          )}
          {info.areas && (
            <div className="apt-stat">
              <span className="label">면적</span>
              <span className="value">{areasWithPyeong(info.areas)}</span>
            </div>
          )}
          <div className="apt-stat">
            <span className="label">매매 매물</span>
            <span className="value highlight">
              {listingsLoading ? '...' : `${dealCount}건`}
            </span>
          </div>
          <div className="apt-stat">
            <span className="label">전세 매물</span>
            <span className="value">
              {listingsLoading ? '...' : `${leaseCount}건`}
            </span>
          </div>
        </div>
      ) : (
        <p className="loading-text">단지 정보를 불러오는 중...</p>
      )}
    </div>
  );
}

export default ApartmentCard;
