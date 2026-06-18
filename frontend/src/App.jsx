import { useEffect, useRef, useState } from 'react';
import Dashboard from './components/Dashboard';
import './App.css';

const PTR_THRESHOLD = 70; // px pull distance needed to trigger refresh

function App() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startX = useRef(null);
  const startY = useRef(null);
  const pullRef = useRef(0);
  const mode = useRef(null); // null = undecided, 'pull' = vertical, 'lock' = horizontal/ignore

  useEffect(() => {
    const onStart = (e) => {
      // only arm when at the very top of the page
      if (window.scrollY <= 0 && e.touches.length === 1) {
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
      } else {
        startX.current = null;
        startY.current = null;
      }
      mode.current = null;
    };
    const onMove = (e) => {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;

      // Decide gesture direction once, after a small dead-zone, then lock it
      if (mode.current == null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // not enough movement yet
        // horizontal-dominant (e.g. filter tab swipe) → ignore for the rest of gesture
        mode.current = Math.abs(dx) > Math.abs(dy) ? 'lock' : 'pull';
      }
      if (mode.current !== 'pull') return;

      if (dy > 0 && window.scrollY <= 0) {
        const d = Math.min(dy * 0.5, 100); // resistance + cap
        pullRef.current = d;
        setPull(d);
        if (e.cancelable) e.preventDefault(); // suppress native overscroll
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };
    const onEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      startX.current = null;
      mode.current = null;
      if (pullRef.current >= PTR_THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  const armed = pull >= PTR_THRESHOLD;

  return (
    <>
      <div
        className="ptr-indicator"
        style={{ height: pull, opacity: pull > 0 || refreshing ? 1 : 0 }}
      >
        <span className={`ptr-text ${refreshing ? 'spinning' : ''}`}>
          {refreshing
            ? '새로고침 중…'
            : armed
              ? '놓으면 새로고침'
              : '↓ 당겨서 새로고침'}
        </span>
      </div>

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
