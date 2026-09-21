"""Daily scheduled data refresh.

Refreshes all listing and transaction data once a day at 06:00 KST.
Also runs a full refresh on server startup if caches are cold.
"""

import logging
import threading
import time
from datetime import datetime, timezone, timedelta

from config import APARTMENTS
import cache

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
REFRESH_HOUR = 6  # 06:00 KST

# In-process guard against overlapping refreshes within a single worker.
# Cross-process coordination (when running >1 gunicorn worker) is handled by the
# Redis-backed cache.acquire_lock("refresh") below.
_refresh_lock = threading.Lock()
_is_refreshing = False
_REFRESH_LOCK_TTL = 3600  # seconds; auto-releases if a worker dies mid-refresh
_STARTUP_RETRY_INTERVAL = 300  # seconds between startup-refresh retries while the lock is held


def _seconds_until_next(hour: int) -> float:
    now = datetime.now(KST)
    target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def refresh_all() -> bool:
    """Refresh listings + transactions for every apartment.

    Returns False only when skipped because another process holds the
    cross-process refresh lock (so the caller may retry later).
    """
    global _is_refreshing

    # Check the in-process flag inside the lock so two threads can't both pass
    # the guard and run the refresh back-to-back.
    with _refresh_lock:
        if _is_refreshing:
            logger.info("[scheduler] Refresh already in progress, skipping")
            return True
        _is_refreshing = True

    # Cross-process guard: with multiple workers only one runs the refresh.
    if not cache.acquire_lock("refresh", _REFRESH_LOCK_TTL):
        logger.info("[scheduler] Another process holds the refresh lock, skipping")
        with _refresh_lock:
            _is_refreshing = False
        return False

    try:
        # Import here to avoid circular imports
        from services.naver_land import _fetch_listings_old_domain, _write_cache
        from services.public_data import get_transactions, get_monthly_summary

        logger.info("[scheduler] === Starting full data refresh ===")
        start = time.time()

        for apt_id, apt in APARTMENTS.items():
            # Fetch listings and transactions in parallel (independent data sources)
            tx_result = [None, None]  # [data, error]

            def _fetch_tx(aid=apt_id, acfg=apt):
                try:
                    logger.info(f"[scheduler] Refreshing transactions for {aid}")
                    data = get_transactions(acfg, months=24, force_refresh=True, apt_id=aid)
                    tx_result[0] = len(data)
                    logger.info(f"[scheduler] {aid} transactions: {len(data)}")
                except Exception as e:
                    tx_result[1] = e
                    logger.error(f"[scheduler] {aid} transactions error: {e}")

            tx_thread = threading.Thread(target=_fetch_tx)
            tx_thread.start()

            # Listings run on main refresh thread (Playwright has its own lock)
            try:
                logger.info(f"[scheduler] Refreshing listings for {apt_id}")
                listings = _fetch_listings_old_domain(
                    apt["name"], apt["complex_no"], query=apt.get("naver_query")
                )
                if listings:
                    _write_cache(f"listings_{apt_id}", {"listings": listings})
                    logger.info(f"[scheduler] {apt_id} listings: {len(listings)}")
                else:
                    logger.warning(f"[scheduler] {apt_id} listings: 0 (kept old cache)")
            except Exception as e:
                logger.error(f"[scheduler] {apt_id} listings error: {e}")

            # Wait for transactions to finish before moving to next apartment
            tx_thread.join()

        elapsed = time.time() - start
        logger.info(f"[scheduler] === Refresh complete in {elapsed:.1f}s ===")
        return True
    finally:
        _is_refreshing = False
        cache.release_lock("refresh")


# --- Manual single-apartment refresh (새로고침 버튼) ---
# 네이버 차단 위험 때문에 한 번에 한 단지만, 단지별 쿨다운을 두고 실행한다.
# 상태는 프로세스 메모리에 둔다 (gunicorn --workers 1 전제).
MANUAL_COOLDOWN = 300  # seconds between manual refreshes of the same apartment

_manual_lock = threading.Lock()
_manual_running = None  # apt_id currently being refreshed
_manual_last = {}  # apt_id -> {"at": epoch, "ok": bool, "listings": int}


def manual_refresh_status(apt_id: str) -> dict:
    with _manual_lock:
        last = _manual_last.get(apt_id)
        retry_after = 0
        if last:
            retry_after = max(0, int(MANUAL_COOLDOWN - (time.time() - last["at"])))
        return {
            "running": _manual_running == apt_id,
            "busyWith": _manual_running,
            "retryAfter": retry_after,
            "last": {"ok": last["ok"], "listings": last["listings"]} if last else None,
        }


def start_manual_refresh(apt_id: str) -> str:
    """Kick off a background refresh of one apartment.

    Returns "started", "running" (this apartment is already refreshing),
    "busy" (another apartment is refreshing) or "cooldown".
    """
    global _manual_running
    apt = APARTMENTS[apt_id]
    with _manual_lock:
        if _manual_running == apt_id:
            return "running"
        if _manual_running is not None:
            return "busy"
        last = _manual_last.get(apt_id)
        if last and time.time() - last["at"] < MANUAL_COOLDOWN:
            return "cooldown"
        _manual_running = apt_id

    def _run():
        global _manual_running
        from services.naver_land import _fetch_listings_old_domain, _write_cache
        from services.public_data import get_transactions

        count = 0
        try:
            logger.info(f"[manual] Refreshing {apt_id}")
            # Playwright has its own lock, so this waits if the daily refresh is scraping
            listings = _fetch_listings_old_domain(
                apt["name"], apt["complex_no"], query=apt.get("naver_query")
            )
            count = len(listings)
            if listings:
                _write_cache(f"listings_{apt_id}", {"listings": listings})
            else:
                logger.warning(f"[manual] {apt_id} listings: 0 (kept old cache)")
            try:
                get_transactions(apt, months=24, force_refresh=True, apt_id=apt_id)
            except Exception as e:
                logger.error(f"[manual] {apt_id} transactions error: {e}")
            logger.info(f"[manual] {apt_id} done: {count} listings")
        except Exception as e:
            logger.error(f"[manual] {apt_id} error: {e}")
        finally:
            with _manual_lock:
                _manual_last[apt_id] = {"at": time.time(), "ok": count > 0, "listings": count}
                _manual_running = None

    threading.Thread(target=_run, daemon=True).start()
    return "started"


def start_scheduler():
    """Start the background scheduler.

    1. Immediate refresh on startup (if caches are cold).
    2. Daily refresh at REFRESH_HOUR KST.
    """
    def _startup_refresh():
        time.sleep(3)  # let gunicorn finish booting
        logger.info("[scheduler] Running startup refresh")
        # 새로고침 도중 재배포되면 죽은 컨테이너가 Redis 락을 못 풀고 TTL까지 남아
        # 새 컨테이너의 startup refresh가 건너뛰어진다 → 락이 풀릴 때까지 재시도.
        deadline = time.time() + _REFRESH_LOCK_TTL + _STARTUP_RETRY_INTERVAL
        while not refresh_all():
            if time.time() >= deadline:
                logger.warning("[scheduler] Startup refresh gave up waiting for the refresh lock")
                break
            logger.info(f"[scheduler] Refresh lock held — retrying in {_STARTUP_RETRY_INTERVAL}s")
            time.sleep(_STARTUP_RETRY_INTERVAL)

    def _daily_loop():
        while True:
            wait = _seconds_until_next(REFRESH_HOUR)
            next_time = datetime.now(KST) + timedelta(seconds=wait)
            logger.info(f"[scheduler] Next refresh at {next_time.strftime('%Y-%m-%d %H:%M KST')} (in {wait/3600:.1f}h)")
            time.sleep(wait)
            logger.info("[scheduler] Daily refresh triggered")
            refresh_all()

    # Startup refresh (background)
    threading.Thread(target=_startup_refresh, daemon=True).start()

    # Daily scheduler (background)
    threading.Thread(target=_daily_loop, daemon=True).start()

    logger.info("[scheduler] Scheduler started")
