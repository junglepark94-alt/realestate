import { useState, useEffect } from 'react';
import { fetchApartments } from '../api';
import ApartmentCard from './ApartmentCard';
import TransactionChart from './TransactionChart';
import ListingTable from './ListingTable';

function Dashboard() {
  const [apartments, setApartments] = useState([]);
  const [selectedApt, setSelectedApt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApartments()
      .then((data) => {
        setApartments(data);
        if (data.length > 0) setSelectedApt(data[0].id);
      })
      .catch(() => setApartments([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading-screen">
          <div className="spinner" />
          <p>아파트 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const selected = apartments.find((a) => a.id === selectedApt);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>아파트 실거래가 & 매물 대시보드</h1>
        <p className="subtitle">관심 아파트의 실거래가 추이와 현재 매물을 한눈에</p>
      </header>

      <div className="tab-bar">
        {apartments.map((apt) => (
          <button
            key={apt.id}
            className={`tab ${apt.id === selectedApt ? 'active' : ''}`}
            onClick={() => setSelectedApt(apt.id)}
          >
            {apt.name}
          </button>
        ))}
      </div>

      {selected && (
        <div className="dashboard-content">
          <ApartmentCard apartment={selected} />
          <TransactionChart aptId={selected.id} aptName={selected.name} />
          <ListingTable aptId={selected.id} aptName={selected.name} />
        </div>
      )}
    </div>
  );
}

export default Dashboard;
