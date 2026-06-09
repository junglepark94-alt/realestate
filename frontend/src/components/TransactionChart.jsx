import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

const formatPrice = (v) => `${(v / 10000).toFixed(1)}억`;
const formatAxisPrice = (v) => `${(v / 10000).toFixed(0)}`;

function TransactionChart({ aptName, data, loading, areaType }) {
  if (loading) return <div className="card loading">실거래가 로딩중...</div>;
  if (!data || !data.summary?.length) {
    return (
      <div className="card">
        <h3>실거래가 추이 &middot; {areaType}㎡</h3>
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
        실거래가 추이 &middot; {areaType}㎡
        <span className="h3-sub">24개월</span>
      </h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--text)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatAxisPrice}
              tick={{ fontSize: 11, fill: 'var(--text)' }}
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
                borderRadius: '8px',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)',
              }}
            />
            <Line type="monotone" dataKey="avg" name="평균" stroke="#6366f1" strokeWidth={2} dot={{ r: 2.5, fill: '#6366f1' }} />
            <Line type="monotone" dataKey="max" name="최고" stroke="#f43f5e" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="min" name="최저" stroke="#22c55e" strokeWidth={1} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend inline */}
      <div className="chart-legend">
        <span><i style={{background:'#6366f1'}} />평균</span>
        <span><i style={{background:'#f43f5e'}} />최고</span>
        <span><i style={{background:'#22c55e'}} />최저</span>
      </div>

      {data.transactions?.length > 0 && (
        <div className="recent-transactions">
          <h4>최근 거래</h4>
          <div className="tx-list">
            {data.transactions.slice(-8).reverse().map((t, i) => (
              <div className="tx-row" key={i}>
                <span className="tx-date">{t.date}</span>
                <span className="tx-price price">{formatPrice(t.price)}</span>
                <span className="tx-info">{t.area}㎡ &middot; {t.floor}층</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionChart;
