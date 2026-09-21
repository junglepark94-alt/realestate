import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  fetchApartments, fetchTransactions, fetchListings, startRefresh, fetchRefreshStatus,
} from '../api';
import useDragScroll from '../hooks/useDragScroll';
import useFavorites from '../hooks/useFavorites';
import { getAreaType, extractAreaTypes, areaLabel } from '../utils/areaType';
import ApartmentCard from './ApartmentCard';
import StatSummary from './StatSummary';
import TransactionChart from './TransactionChart';
import ListingTable from './ListingTable';
import CompareView from './CompareView';
import LoanSimulator from './LoanSimulator';

// 최근 실거래가가 이 값(만원) 미만이면 '11억대 이하'로 보고 단지 칩을 강조
const UNDER_BUDGET_MANWON = 120000; // 12억

// 구 칩 고정 순서 (나머지는 데이터 순서 유지)
const GU_PRIORITY = ['은평구', '양천구'];
// 구 칩 행 맨 왼쪽의 즐겨찾기 필터 (구 이름과 겹치지 않는 값)
const FAV_FILTER = '__fav__';

// 새로고침 진행 상태 확인 주기 / 최대 대기 (전체 새로고침 뒤에 줄 서면 오래 걸릴 수 있음)
const REFRESH_POLL_MS = 3000;
const REFRESH_MAX_WAIT_MS = 5 * 60 * 1000;

const guRank = (gu) => {
  const i = GU_PRIORITY.indexOf(gu);
  return i === -1 ? GU_PRIORITY.length : i;
};

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
  const [listingsUpdatedAt, setListingsUpdatedAt] = useState(null);

  // Area filter
  const [areaType, setAreaType] = useState('59');

  // Mobile gu browser (which gu's apartments are shown in the mobile tab row)
  const [guFilter, setGuFilter] = useState(null);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);

  const { favorites, toggleFavorite, favoritesReady } = useFavorites();

  // Load apartment list
  useEffect(() => {
    Promise.all([fetchApartments(), favoritesReady])
      .then(([data, favIds]) => {
        setApartments(data);
        // 즐겨찾기가 있으면 즐겨찾기 탭 + 첫 즐겨찾기 단지로 시작
        const firstFav = favIds.map((id) => data.find((a) => a.id === id)).find(Boolean);
        if (firstFav) {
          setGuFilter(FAV_FILTER);
          setSelectedApt(firstFav.id);
        } else if (data.length > 0) {
          // 구 칩 목록과 동일한 정렬(은평구 → 양천구 순으로 맨 앞)로 첫 번째 구를 구하고,
          // 그 구에 속한 첫 아파트를 기본 선택해 항상 맨 첫 번째 필터가 활성화되도록 함
          const sortedGus = [...new Set(data.map((a) => a.gu))].sort(
            (a, b) => guRank(a) - guRank(b)
          );
          const firstGu = sortedGus[0];
          const firstApt = data.find((a) => a.gu === firstGu) || data[0];
          setSelectedApt(firstApt.id);
        }
      })
      .catch(() => setApartments([]))
      .finally(() => setLoading(false));
  }, [favoritesReady]);

  const guChipsRef = useDragScroll();
  const aptChipsRef = useDragScroll();

  const selected = apartments.find((a) => a.id === selectedApt);
  const gus = useMemo(() => {
    const unique = [...new Set(apartments.map((a) => a.gu))];
    // 은평구 → 양천구 순으로 맨 좌측에
    return unique.sort((a, b) => guRank(a) - guRank(b));
  }, [apartments]);
  // 목록에서 사라진 단지 id는 제외, 즐겨찾기한 순서 유지
  const favoriteApts = useMemo(
    () => favorites.map((id) => apartments.find((a) => a.id === id)).filter(Boolean),
    [favorites, apartments]
  );
  // 즐겨찾기가 모두 해제되면 즐겨찾기 필터에서 선택 단지의 구로 복귀
  const activeGu =
    guFilter === FAV_FILTER && favoriteApts.length === 0
      ? selected?.gu
      : guFilter || selected?.gu;
  const visibleApts =
    activeGu === FAV_FILTER ? favoriteApts : apartments.filter((apt) => apt.gu === activeGu);

  // Auto-scroll active tab / gu chip into view (horizontal scroll lists)
  useEffect(() => {
    document.querySelectorAll('.tab.active').forEach((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
  }, [selectedApt]);

  useEffect(() => {
    const chip = document.querySelector('.gu-chip.active');
    if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeGu]);

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
    setListingsUpdatedAt(null);
    fetchListings(selectedApt)
      .then((d) => {
        setListings(d.listings || []);
        setListingsUpdatedAt(d.updatedAt || null);
      })
      .catch(() => { setListings([]); setListingsError(true); })
      .finally(() => setListingsLoading(false));
  }, [selectedApt]);

  // 새로고침 버튼: 선택한 단지만 서버에서 재수집 → 끝나면 화면 데이터만 조용히 교체
  const [refreshingApt, setRefreshingApt] = useState(null);
  const [refreshNote, setRefreshNote] = useState(null); // { aptId, text }
  const selectedAptRef = useRef(selectedApt);
  useEffect(() => {
    selectedAptRef.current = selectedApt;
  }, [selectedApt]);

  const handleRefresh = useCallback(async () => {
    const aptId = selectedAptRef.current;
    if (!aptId || refreshingApt) return;
    const note = (text) => setRefreshNote({ aptId, text });
    setRefreshNote(null);
    setRefreshingApt(aptId);
    try {
      const res = await startRefresh(aptId);
      if (res.result === 'cooldown') {
        note(`방금 새로고침했어요. ${Math.ceil(res.retryAfter / 60)}분 뒤에 다시 시도해 주세요`);
        return;
      }
      if (res.result === 'busy') {
        note('다른 단지를 새로고침하는 중이에요. 잠시 뒤 다시 시도해 주세요');
        return;
      }
      const deadline = Date.now() + REFRESH_MAX_WAIT_MS;
      let status = res;
      while (status.running && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, REFRESH_POLL_MS));
        status = await fetchRefreshStatus(aptId);
      }
      if (status.running) {
        note('수집이 오래 걸리고 있어요. 잠시 뒤 페이지를 다시 열어 주세요');
        return;
      }
      if (selectedAptRef.current === aptId) {
        const [l, tx] = await Promise.all([
          fetchListings(aptId),
          fetchTransactions(aptId, 24).catch(() => null),
        ]);
        if (selectedAptRef.current === aptId) {
          setListings(l.listings || []);
          setListingsUpdatedAt(l.updatedAt || null);
          setListingsError(false);
          if (tx) setTxData(tx);
        }
      }
      if (!status.last?.ok) note('네이버에서 매물을 가져오지 못했어요 (기존 데이터 유지)');
    } catch {
      note('새로고침에 실패했어요');
    } finally {
      setRefreshingApt(null);
    }
  }, [refreshingApt]);

  // Extract available area types, excluding hidden ones
  const availableTypes = useMemo(() => {
    const txTypes = txData?.transactions ? extractAreaTypes(txData.transactions) : [];
    const listingTypes = extractAreaTypes(listings);
    const merged = new Set([...txTypes, ...listingTypes]);
    const hiddenTypes = selected?.hiddenAreaTypes || [];
    return [...merged]
      .filter((t) => !hiddenTypes.includes(t))
      .sort((a, b) => Number(a) - Number(b));
  }, [txData, listings, selected]);

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

  // 대출 시뮬레이션 기본 집값 = 선택 면적의 가장 최근 실거래가(만원)
  const recentAreaPrice = useMemo(() => {
    const txs = filteredTxData?.transactions;
    return txs && txs.length > 0 ? txs[txs.length - 1].price : null;
  }, [filteredTxData]);

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
        <div className="header-row">
          <div className="brand">
            <div className="brand-icon">D</div>
            <h1>종걸응경 협동조합</h1>
          </div>
          <button
            className={`compare-toggle ${compareMode ? 'on' : ''}`}
            onClick={() => setCompareMode(!compareMode)}
          >
            {compareMode ? '돌아가기' : '비교'}
          </button>
        </div>
        <p className="subtitle">도윤집 마련 프로젝트</p>
      </header>

      {compareMode && (
        <CompareView apartments={apartments} initialId={selectedApt} />
      )}

      {!compareMode && (
      <>
      <p className="budget-legend">
        <i className="budget-dot" /> 최근 실거래가 12억 미만 단지
      </p>

      {/* Two-row tab bar: gu chip row + apartment chip row (all screen sizes) */}
      <div className="tab-bar">
        <div className="gu-chips" ref={guChipsRef}>
          {favoriteApts.length > 0 && (
            <button
              className={`gu-chip fav-chip ${activeGu === FAV_FILTER ? 'active' : ''}`}
              onClick={() => setGuFilter(FAV_FILTER)}
            >
              ★ 즐겨찾기 {favoriteApts.length}
            </button>
          )}
          {gus.map((gu) => (
            <button
              key={gu}
              className={`gu-chip ${gu === activeGu ? 'active' : ''}`}
              onClick={() => setGuFilter(gu)}
            >
              {gu}
            </button>
          ))}
        </div>
        <div className="apt-chips" ref={aptChipsRef}>
          {visibleApts.map((apt) => {
              // 최근 실거래가 11억대 이하(12억 미만) 단지 강조
              const underBudget =
                apt.recentPrice != null && apt.recentPrice < UNDER_BUDGET_MANWON;
              return (
                <button
                  key={apt.id}
                  className={`tab ${apt.id === selectedApt ? 'active' : ''} ${underBudget ? 'under-budget' : ''}`}
                  onClick={() => setSelectedApt(apt.id)}
                >
                  {underBudget && <i className="budget-dot" />}
                  {activeGu !== FAV_FILTER && favorites.includes(apt.id) && (
                    <span className="tab-star">★</span>
                  )}
                  {apt.name}
                </button>
              );
            })}
        </div>
      </div>

      {selected && (
        <div className="dashboard-content">
          <ApartmentCard
            apartment={selected}
            dealCount={listingCounts.dealCount}
            leaseCount={listingCounts.leaseCount}
            listingsLoading={listingsLoading}
            isFavorite={favorites.includes(selected.id)}
            onToggleFavorite={() => toggleFavorite(selected.id)}
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
                  {areaLabel(t)}
                </button>
              ))}
            </div>
          )}

          <StatSummary
            txData={filteredTxData}
            listings={listings}
            areaType={areaType}
            txLoading={txLoading}
            listingsLoading={listingsLoading}
          />

          <LoanSimulator defaultPrice={recentAreaPrice} areaType={areaType} />

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
            updatedAt={listingsUpdatedAt}
            onRefresh={handleRefresh}
            refreshing={refreshingApt === selectedApt}
            refreshDisabled={refreshingApt !== null}
            refreshNote={refreshNote?.aptId === selectedApt ? refreshNote.text : null}
          />
        </div>
      )}
      </>
      )}

      <footer className="dashboard-footer">
        <span>종걸응경 협동조합 &middot; 도윤집 마련 프로젝트</span>
        <span>실거래가·매물 데이터는 매일 06:00에 자동 업데이트됩니다</span>
      </footer>
    </div>
  );
}

export default Dashboard;
