import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  return (
    <>
      <div className="notice-banner">
        <div className="notice-track">
          {Array.from({ length: 12 }).map((_, i) => (
            <span className="notice-text" key={i} aria-hidden={i > 0 ? 'true' : undefined}>
              박종걸에게 스타벅스 아이스 아메리카노 (T) 기프티콘 한 장 주시면 유지보수 운영에 큰 힘이 됩니다.
            </span>
          ))}
        </div>
      </div>
      <Dashboard />
    </>
  );
}

export default App;
