"""Daily scheduled data refresh.

Refreshes all listing and transaction data once a day at 06:00 KST.
Also runs a full refresh on server startup if caches are cold.
"""

import logging
import threading
import time
from datetime import datetime, timezone, timedelta

from config import APARTMENTS

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
REFRESH_HOUR = 6  # 06:00 KST

# File-based lock to prevent duplicate refreshes from multiple workers
_refresh_lock = threading.Lock()
_is_refreshing = False


def _seconds_until_next(hour: int) -> float:
    now = datetime.now(KST)
    target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def refresh_all():
    """Refresh listings + transactions for every apartment."""
    global _is_refreshing
    if _is_refreshing:
        logger.info("[scheduler] Refresh already in progress, skipping")
        return

    with _refresh_lock:
        _is_refreshing = True
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
        finally:
            _is_refreshing = False


def start_scheduler():
    """Start the background scheduler.

    1. Immediate refresh on startup (if caches are cold).
    2. Daily refresh at REFRESH_HOUR KST.
    """
    def _startup_refresh():
        time.sleep(3)  # let gunicorn finish booting
        logger.info("[scheduler] Running startup refresh")
        refresh_all()

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
