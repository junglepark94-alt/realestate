import { useState, useEffect, useMemo } from 'react';
import { fetchApartments, fetchTransactions, fetchListings } from '../api';
import { getAreaType, extractAreaTypes } from '../utils/areaType';
import ApartmentCard from './ApartmentCard';
import TransactionChart from './TransactionChart';
import ListingTable from './ListingTable';

function Dashboard() {
  const [apartments, setApartments] = useState([]);
  const [selectedApt, setSelectedApt] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data states (lifted from children)
  const [txData, setTxData] = useState(null);
  const [txLoading, setTxLoading] = useState(false);
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState(false);

  // Area filter
  const [areaType, setAreaType] = useState('59');

  // Load apartment list
  useEffect(() => {
    fetchApartments()
      .then((data) => {
        setApartments(data);
        if (data.length > 0) setSelectedApt(data[0].id);
      })
      .catch(() => setApartments([]))
      .finally(() => setLoading(false));
  }, []);

  const selected = apartments.find((a) => a.id === selectedApt);
  const hiddenTypes = selected?.hiddenAreaTypes || [];

  // Load transactions + listings when apartment changes
  useEffect(() => {
    if (!selectedApt) return;

    setTxLoading(true);
    setTxData(null);
    fetchTransactions(selectedApt, 24)
      .then(setTxData)
      .catch(() => setTxData(null))
      .finally(() => setTxLoading(false));

    setListingsLoading(true);
    setListingsError(false);
    setListings([]);
    fetchListings(selectedApt)
      .then((d) => setListings(d.listings || []))
      .catch(() => { setListings([]); setListingsError(true); })
      .finally(() => setListingsLoading(false));
  }, [selectedApt]);

  // Extract available area types, excluding hidden ones
  const availableTypes = useMemo(() => {
    const txTypes = txData?.transactions ? extractAreaTypes(txData.transactions) : [];
    const listingTypes = extractAreaTypes(listings);
    const merged = new Set([...txTypes, ...listingTypes]);
    return [...merged]
      .filter((t) => !hiddenTypes.includes(t))
      .sort((a, b) => Number(a) - Number(b));
  }, [txData, listings, hiddenTypes]);

  // Auto-select first available type when apartment changes or types update
  useEffect(() => {
    if (availableTypes.length > 0 && !availableTypes.includes(areaType)) {
      setAreaType(availableTypes[0]);
    }
  }, [availableTypes, selectedApt]);

  // Filter transaction data by area type
  const filteredTxData = useMemo(() => {
    if (!txData) return null;
    const filtered = txData.transactions.filter(
      (t) => getAreaType(t.area) === areaType
    );
    // Recompute summary from filtered transactions
    const monthly = {};
    for (const t of filtered) {
      const key = t.dealMonth;
      if (!monthly[key]) monthly[key] = [];
      monthly[key].push(t.price);
    }
    const summary = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, prices]) => ({
        month,
        avg: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
        min: Math.min(...prices),
        max: Math.max(...prices),
        count: prices.length,
      }));
    return { transactions: filtered, summary };
  }, [txData, areaType]);

  // Filter listings: exclude 월세, filter by area type
  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      if (l.tradeType === '월세') return false;
      return getAreaType(l.area) === areaType;
    });
  }, [listings, areaType]);

  // Compute deal/lease counts from all listings (not filtered by area)
  const listingCounts = useMemo(() => {
    let dealCount = 0;
    let leaseCount = 0;
    for (const l of listings) {
      if (l.tradeType === '매매') dealCount++;
      else if (l.tradeType === '전세') leaseCount++;
    }
    return { dealCount, leaseCount };
  }, [listings]);

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
          <ApartmentCard
            apartment={selected}
            dealCount={listingCounts.dealCount}
            leaseCount={listingCounts.leaseCount}
            listingsLoading={listingsLoading}
          />

          {/* Area type filter */}
          {availableTypes.length > 0 && (
            <div className="area-filter">
              <span className="area-filter-label">면적</span>
              {availableTypes.map((t) => (
                <button
                  key={t}
                  className={`area-tab ${t === areaType ? 'active' : ''}`}
                  onClick={() => setAreaType(t)}
                >
                  {t}㎡
                </button>
              ))}
            </div>
          )}

          <TransactionChart
            aptName={selected.name}
            data={filteredTxData}
            loading={txLoading}
            areaType={areaType}
          />
          <ListingTable
            aptName={selected.name}
            listings={filteredListings}
            loading={listingsLoading}
            error={listingsError}
          />
        </div>
      )}
    </div>
  );
}

export default Dashboard;
