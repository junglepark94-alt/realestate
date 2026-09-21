import { useState, useCallback } from 'react';

const STORAGE_KEY = 'favoriteApts';

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// 즐겨찾기 단지 id 목록 (브라우저 localStorage에 저장, 추가한 순서 유지)
export default function useFavorites() {
  const [favorites, setFavorites] = useState(load);

  const toggleFavorite = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 저장 실패(시크릿 모드 등)해도 현재 세션에서는 동작
      }
      return next;
    });
  }, []);

  return { favorites, toggleFavorite };
}
