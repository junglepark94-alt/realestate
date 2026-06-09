import json
import re
import time
import logging
import threading
from pathlib import Path
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright
from config import APARTMENTS

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent.parent / ".cache"
CACHE_DIR.mkdir(exist_ok=True)
# Long TTL — scheduler refreshes daily, this is just a safety net
CACHE_TTL = timedelta(days=7)

_lock = threading.Lock()
_pw_instance = None
_browser_instance = None

LAND_OLD = "https://land.naver.com"


def _ensure_browser():
    global _pw_instance, _browser_instance
    if _browser_instance and _browser_instance.is_connected():
        return _browser_instance
    _pw_instance = sync_playwright().start()
    _browser_instance = _pw_instance.chromium.launch(
        headless=True,
        args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    )
    return _browser_instance


def _make_page():
    browser = _ensure_browser()
    ctx = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 800},
        ignore_https_errors=True,
    )
    page = ctx.new_page()
    page.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    """)
    return page


def _read_cache(key: str) -> dict | None:
    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data
    except Exception:
        return None


def _read_cache_any(key: str) -> tuple[dict | None, bool]:
    """Read cache. Returns (data, is_expired)."""
    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None, True
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        cached_at = datetime.fromisoformat(data.get("_cached_at", "2000-01-01"))
        expired = datetime.now() - cached_at > CACHE_TTL
        return data, expired
    except Exception:
        return None, True


def _write_cache(key: str, data: dict):
    data["_cached_at"] = datetime.now().isoformat()
    path = CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _fetch_listings_old_domain(apt_name: str, complex_no: str) -> list[dict]:
    """Fetch listings via land.naver.com (old domain) article search.

    Navigates to the article search page and intercepts the articleSearch.naver
    AJAX response. This endpoint is NOT rate-limited unlike new.land.naver.com.
    """
    with _lock:
        page = _make_page()
        try:
            captured = [None]

            def on_response(response):
                if "articleSearch.naver" in response.url:
                    try:
                        captured[0] = response.json()
                    except Exception:
                        pass

            page.on("response", on_response)

            url = f"{LAND_OLD}/search/article.naver?tab=article&query={apt_name}"
            logger.info(f"[listings_old] Navigating to {url}")
            page.goto(url, wait_until="networkidle", timeout=20000)
            time.sleep(2)

            if not captured[0]:
                logger.warning(f"[listings_old] No articleSearch response for {apt_name}")
                return []

            info = captured[0].get("articleInfo", {})
            articles = info.get("cfmArticleList", [])
            total = info.get("cfmArticleCount", 0)
            logger.info(f"[listings_old] Total: {total}, page returned: {len(articles)}")

            # Filter by complexCode to get exact apartment match
            matched = [a for a in articles if str(a.get("complexCode")) == str(complex_no)]
            logger.info(f"[listings_old] Matched complexCode={complex_no}: {len(matched)}")

            listings = []
            for a in matched:
                trade_type = a.get("tradeTypeCodeName", "")
                price_display = a.get("price", a.get("basePrice", ""))

                listings.append({
                    "articleNo": a.get("articleNumber", ""),
                    "articleName": a.get("articleName", ""),
                    "tradeType": trade_type,
                    "price": price_display,
                    "area": float(a.get("size2", 0) or 0),
                    "areaSupply": float(a.get("size1", 0) or 0),
                    "areaName": f"{a.get('size1', '')}㎡",
                    "floor": a.get("floor", ""),
                    "building": a.get("building", ""),
                    "direction": "",
                    "articleConfirmYmd": a.get("registYmd", ""),
                    "articleFeatureDesc": a.get("articleDescription", ""),
                    "realtorName": a.get("realterName", ""),
                    "cpName": a.get("cpName", ""),
                })

            return listings
        except Exception as e:
            logger.error(f"[listings_old] Error fetching {apt_name}: {e}")
            return []
        finally:
            page.context.close()


# --- Public API (always return from cache) ---

def get_complex_info(apt_id: str) -> dict | None:
    apt = APARTMENTS.get(apt_id)
    if not apt:
        return None

    # Use static info from config
    static = apt.get("info")
    if static:
        return {
            "name": apt["name"],
            "address": static.get("address", ""),
            "totalHouseholdCount": static.get("totalHouseholdCount", 0),
            "highFloor": static.get("highFloor", ""),
            "lowFloor": static.get("lowFloor", ""),
            "useApproveYmd": static.get("useApproveYmd", ""),
            "builder": static.get("builder", ""),
            "areas": static.get("areas", ""),
            "complexNo": apt.get("complex_no", ""),
            "dealCount": 0,
            "leaseCount": 0,
        }
    return None


def save_listings_cache(apt_id: str, listings: list[dict]):
    """Save listings data pushed from a local scraper."""
    _write_cache(f"listings_{apt_id}", {"listings": listings})


def get_listings(apt_id: str) -> list[dict]:
    """Always return from cache. Scheduler handles refreshes."""
    cache = _read_cache(f"listings_{apt_id}")
    if cache and "listings" in cache:
        return cache["listings"]
    # No cache yet (server just deployed) — return empty, scheduler will fill it
    return []


def get_price_trend(apt_id: str, years: int = 5) -> dict | None:
    cache = _read_cache(f"trend_{apt_id}")
    if cache:
        cache.pop("_cached_at", None)
        return cache
    return None
