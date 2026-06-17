import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  return (
    <>
      <div className="notice-banner">
        <div className="notice-track">
          <span className="notice-text">
            박종걸에게 스타벅스 아이스 아메리카노 (T) 기프티콘 한 장 주시면 유지보수 운영에 큰 힘이 됩니다.
          </span>
          <span className="notice-text" aria-hidden="true">
            박종걸에게 스타벅스 아이스 아메리카노 (T) 기프티콘 한 장 주시면 유지보수 운영에 큰 힘이 됩니다.
          </span>
        </div>
      </div>
      <Dashboard />
    </>
  );
}

export default App;
