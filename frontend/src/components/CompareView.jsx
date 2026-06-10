import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchTransactions } from '../api';
import { getAreaType, areaLabel } from '../utils/areaType';

const COLORS = ['#3182f6', '#f04452', '#00c473', '#9263f8'];
const MAX_SELECT = 4;

const formatPrice = (v) => `${(v / 10000).toFixed(1)}억`;
const formatAxisPrice = (v) => {
  const eok = v / 10000;
  return Number.isInteger(eok) ? `${eok}` : eok.toFixed(1);
};

function CompareView({ apartments, initialId }) {
  const [selectedIds, setSelectedIds] = useState(initialId ? [initialId] : []);
  const [dataMap, setDataMap] = useState({});
  const [loadingIds, setLoadingIds] = useState([]);
  const [areaType, setAreaType] = useState('84');

  // Fetch transactions for newly selected apartments
  useEffect(() => {
    for (const id of selectedIds) {
      if (dataMap[id] !== undefined || loadingIds.includes(id)) continue;
      setLoadingIds((prev) => [...prev, id]);
      fetchTransactions(id, 24)
        .then((d) => setDataMap((prev) => ({ ...prev, [id]: d.transactions || [] })))
        .catch(() => setDataMap((prev) => ({ ...prev, [id]: [] })))
        .finally(() => setLoadingIds((prev) => prev.filter((x) => x !== id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECT) return prev;
      return [...prev, id];
    });
  };

  // Area types available across selected apartments
  const availableTypes = useMemo(() => {
    const s = new Set();
    for (const id of selectedIds) {
      for (const t of dataMap[id] || []) {
        const at = getAreaType(t.area);
        if (at) s.add(at);
      }
    }
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [selectedIds, dataMap]);

  useEffect(() => {
    if (availableTypes.length > 0 && !availableTypes.includes(areaType)) {
      setAreaType(availableTypes.includes('84') ? '84' : availableTypes[0]);
    }
  }, [availableTypes, areaType]);

  // Merge monthly averages of each apartment into one series
  const chartData = useMemo(() => {
    const byMonth = {};
    for (const id of selectedIds) {
      const txs = (dataMap[id] || []).filter((t) => getAreaType(t.area) === areaType);
      const monthly = {};
      for (const t of txs) {
        if (!monthly[t.dealMonth]) monthly[t.dealMonth] = [];
        monthly[t.dealMonth].push(t.price);
      }
      for (const [m, prices] of Object.entries(monthly)) {
        if (!byMonth[m]) byMonth[m] = { month: m };
        byMonth[m][id] = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
      }
    }
    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((d) => ({ ...d, label: d.month.slice(2).replace('-', '.') }));
  }, [selectedIds, dataMap, areaType]);

  // Latest deal per selected apartment (for the legend summary)
  const latestByApt = useMemo(() => {
    const out = {};
    for (const id of selectedIds) {
      const txs = (dataMap[id] || []).filter((t) => getAreaType(t.area) === areaType);
      out[id] = txs.length > 0 ? txs[txs.length - 1] : null;
    }
    return out;
  }, [selectedIds, dataMap, areaType]);

  const nameOf = (id) => apartments.find((a) => a.id === id)?.name || id;
  const isLoading = loadingIds.length > 0;

  // Group apartments by gu for the picker
  const grouped = useMemo(() => {
    const acc = {};
    for (const apt of apartments) {
      if (!acc[apt.gu]) acc[apt.gu] = [];
      acc[apt.gu].push(apt);
    }
    return Object.entries(acc);
  }, [apartments]);

  return (
    <div className="compare-view">
      <div className="card compare-picker">
        <h3>
          비교할 아파트 선택
          <span className="h3-sub">최대 {MAX_SELECT}개</span>
        </h3>
        {grouped.map(([gu, apts]) => (
          <div key={gu} className="compare-group">
            <span className="compare-group-label">{gu}</span>
            <div className="compare-chips">
              {apts.map((apt) => {
                const idx = selectedIds.indexOf(apt.id);
                const on = idx >= 0;
                return (
                  <button
                    key={apt.id}
                    className={`compare-chip ${on ? 'active' : ''}`}
                    onClick={() => toggle(apt.id)}
                  >
                    {on && <i className="chip-dot" style={{ background: COLORS[idx] }} />}
                    {apt.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedIds.length > 0 && (
        <div className="card">
          <h3>
            실거래가 비교
            {availableTypes.length > 0 && <span className="h3-sub">24개월 · 월평균</span>}
          </h3>

          {availableTypes.length > 0 && (
            <div className="area-filter" style={{ marginBottom: 16 }}>
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

          {isLoading ? (
            <div className="skeleton skeleton-block" />
          ) : chartData.length === 0 ? (
            <p className="empty-text">해당 면적의 실거래 데이터가 없습니다</p>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f2f4f6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#8b95a1' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e8eb' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={formatAxisPrice}
                    tick={{ fontSize: 11, fill: '#8b95a1' }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    unit="억"
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    formatter={(v, name) => [formatPrice(v), nameOf(name)]}
                    labelFormatter={(l) => `20${l.replace('.', '년 ')}월`}
                    contentStyle={{
                      fontSize: '13px',
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 8px 24px rgba(25, 31, 40, 0.12)',
                    }}
                  />
                  {selectedIds.map((id, i) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      name={id}
                      stroke={COLORS[i]}
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: COLORS[i], strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-apartment latest deal summary */}
          <div className="compare-legend">
            {selectedIds.map((id, i) => {
              const last = latestByApt[id];
              return (
                <div key={id} className="compare-legend-row">
                  <i className="chip-dot" style={{ background: COLORS[i] }} />
                  <span className="compare-legend-name">{nameOf(id)}</span>
                  {last ? (
                    <span className="compare-legend-price">
                      {formatPrice(last.price)}
                      <span className="compare-legend-date"> · {last.date.slice(2).replace(/-/g, '.')} · {last.floor}층</span>
                    </span>
                  ) : (
                    <span className="compare-legend-date">거래 없음</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedIds.length === 0 && (
        <div className="card">
          <p className="empty-text">위에서 아파트를 선택하면 가격 추이를 겹쳐볼 수 있습니다</p>
        </div>
      )}
    </div>
  );
}

export default CompareView;
