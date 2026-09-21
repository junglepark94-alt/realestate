import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFavorites, setFavorite } from '../api';

const STORAGE_KEY = 'favoriteApts';
// 서버 저장 도입 전 localStorage에만 있던 즐겨찾기를 서버로 1회 올렸는지 표시
const MIGRATED_KEY = 'favoriteAptsMigrated';

function loadLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveLocal(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // 저장 실패(시크릿 모드 등)해도 동작에는 지장 없음
  }
}

// 가족 공용 즐겨찾기 단지 id 목록 (서버 저장, 추가한 순서 유지).
// localStorage는 첫 화면을 바로 그리기 위한 캐시로만 쓴다.
export default function useFavorites() {
  const [favorites, setFavorites] = useState(loadLocal);
  // 늦게 도착한 이전 응답이 최신 상태를 덮어쓰지 않도록 요청 순번을 기록
  const seq = useRef(0);

  const apply = useCallback((ids) => {
    setFavorites(ids);
    saveLocal(ids);
  }, []);

  const refresh = useCallback(() => {
    const mySeq = ++seq.current;
    return fetchFavorites()
      .then((ids) => {
        if (mySeq === seq.current) apply(ids);
        return ids;
      })
      .catch(() => null);
  }, [apply]);

  useEffect(() => {
    const local = loadLocal();
    let migrated = true;
    try {
      migrated = localStorage.getItem(MIGRATED_KEY) === '1';
    } catch {
      // localStorage를 못 쓰면 올릴 로컬 즐겨찾기도 없음
    }

    refresh().then(async (serverIds) => {
      if (!serverIds || migrated) return;
      for (const id of local.filter((f) => !serverIds.includes(f))) {
        try {
          apply(await setFavorite(id, true));
        } catch {
          // 목록에서 빠진 단지 등은 건너뜀
        }
      }
      try {
        localStorage.setItem(MIGRATED_KEY, '1');
      } catch {
        // 무시
      }
    });

    // 다른 가족이 바꾼 내용을 탭으로 돌아올 때 반영
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh, apply]);

  const toggleFavorite = useCallback(
    (id) => {
      const on = !favorites.includes(id);
      // 먼저 화면에 반영하고, 서버 응답(전체 목록)으로 확정
      setFavorites((prev) => (on ? [...prev, id] : prev.filter((f) => f !== id)));
      const mySeq = ++seq.current;
      setFavorite(id, on)
        .then((ids) => {
          if (mySeq === seq.current) apply(ids);
        })
        .catch(() => {
          // 실패하면 서버 상태로 되돌림
          refresh();
        });
    },
    [favorites, apply, refresh]
  );

  return { favorites, toggleFavorite };
}
