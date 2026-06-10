import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { areaLabel } from '../utils/areaType';

const formatPrice = (v) => `${(v / 10000).toFixed(1)}억`;
const formatAxisPrice = (v) => `${(v / 10000).toFixed(0)}`;

function TransactionChart({ aptName, data, loading, areaType }) {
  if (loading) {
    return (
      <div className="card">
        <div className="skeleton skeleton-title" style={{ width: 150, marginBottom: 18 }} />
        <div className="skeleton skeleton-block" />
        <div className="skeleton skeleton-row" style={{ marginTop: 18 }} />
        <div className="skeleton skeleton-row" />
      </div>
    );
  }
  if (!data || !data.summary?.length) {
    return (
      <div className="card">
        <h3>실거래가 추이 &middot; {areaLabel(areaType)}</h3>
        <p className="empty-text">해당 면적의 실거래 데이터가 없습니다</p>
      </div>
    );
  }

  // Shorten month labels: "2025-06" → "25.06"
  const chartData = data.summary.map((d) => ({
    ...d,
    label: d.month.slice(2).replace('-', '.'),
  }));

  return (
    <div className="card">
      <h3>
        실거래가 추이 &middot; {areaLabel(areaType)}
        <span className="h3-sub">24개월</span>
      </h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
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
              width={32}
              unit="억"
            />
            <Tooltip
              formatter={(v, name) => [formatPrice(v), name]}
              labelFormatter={(l) => `20${l.replace('.', '년 ')}월`}
              contentStyle={{
                fontSize: '13px',
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 8px 24px rgba(25, 31, 40, 0.12)',
              }}
            />
            <Line type="monotone" dataKey="avg" name="평균" stroke="#3182f6" strokeWidth={2.5} dot={{ r: 2.5, fill: '#3182f6', strokeWidth: 0 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="max" name="최고" stroke="#f04452" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="min" name="최저" stroke="#00c473" strokeWidth={1} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend inline */}
      <div className="chart-legend">
        <span><i style={{background:'#3182f6'}} />평균</span>
        <span><i style={{background:'#f04452'}} />최고</span>
        <span><i style={{background:'#00c473'}} />최저</span>
      </div>

      {data.transactions?.length > 0 && (
        <div className="recent-transactions">
          <h4>최근 거래</h4>
          <div className="tx-list">
            {data.transactions.slice(-8).reverse().map((t, i) => (
              <div className="tx-row" key={i}>
                <span className="tx-date">{t.date}</span>
                <span className="tx-price price">{formatPrice(t.price)}</span>
                <span className="tx-info">{areaLabel(t.area)} &middot; {t.floor}층</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionChart;
