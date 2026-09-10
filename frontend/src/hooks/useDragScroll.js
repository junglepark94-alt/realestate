import { useCallback, useRef } from 'react';

// 데스크톱(마우스)에서 가로 스크롤 컨테이너를 드래그/휠로 스크롤할 수 있게 한다.
// - 마우스 드래그: 좌우 이동만큼 scrollLeft 변경 (터치는 브라우저 기본 스크롤 유지)
// - 세로 휠: 가로 스크롤로 변환 (내용이 넘칠 때만)
// - 드래그 후 발생하는 click은 막아서 칩이 잘못 선택되지 않게 한다
const DRAG_THRESHOLD = 4;

// 반환값은 callback ref: 요소가 마운트/언마운트될 때마다(예: 비교 모드 토글) 리스너를 다시 붙인다.
export default function useDragScroll() {
  const cleanupRef = useRef(null);

  return useCallback((el) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!el) return;

    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    let moved = false;

    const onPointerDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
        moved = true;
        el.classList.add('dragging');
      }
      if (moved) {
        el.scrollLeft = startScroll - dx;
        e.preventDefault();
      }
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      // click 이벤트는 pointerup 직후 발생하므로 다음 틱에 moved 초기화
      setTimeout(() => { moved = false; }, 0);
    };

    const onClickCapture = (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('wheel', onWheel, { passive: false });

    cleanupRef.current = () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);
}
