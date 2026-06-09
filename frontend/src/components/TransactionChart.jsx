import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { fetchTransactions } from '../api';

const formatPrice = (v) => `${(v / 10000).toFixed(1)}억`;

function TransactionChart({ aptId, aptName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchTransactions(aptId, 24)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [aptId]);

  if (loading) return <div className="card loading">실거래가 로딩중...</div>;
  if (!data || !data.summary?.length) return <div className="card empty">실거래가 데이터 없음</div>;

  return (
    <div className="card">
      <h3>📊 {aptName} 실거래가 추이 (최근 24개월)</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data.summary} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatPrice} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(v) => [formatPrice(v), '']}
            labelFormatter={(l) => `${l}`}
          />
          <Legend />
          <Line type="monotone" dataKey="avg" name="평균" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="max" name="최고" stroke="#dc2626" strokeWidth={1} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="min" name="최저" stroke="#16a34a" strokeWidth={1} strokeDasharray="4 4" />
        </LineChart>
      </ResponsiveContainer>

      {data.transactions?.length > 0 && (
        <div className="recent-transactions">
          <h4>최근 거래 내역</h4>
          <table>
            <thead>
              <tr>
                <th>거래일</th>
                <th>가격</th>
                <th>전용면적</th>
                <th>층</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.slice(-10).reverse().map((t, i) => (
                <tr key={i}>
                  <td>{t.date}</td>
                  <td className="price">{formatPrice(t.price)}</td>
                  <td>{t.area}㎡</td>
                  <td>{t.floor}층</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TransactionChart;
