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
CACHE_TTL_SHORT = timedelta(minutes=30)
CACHE_TTL_LONG = timedelta(hours=24)

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


def _read_cache(key: str, ttl: timedelta | None = None) -> dict | None:
    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        cached_at = datetime.fromisoformat(data.get("_cached_at", "2000-01-01"))
        if ttl and datetime.now() - cached_at > ttl:
            return None
        return data
    except Exception:
        return None


def _write_cache(key: str, data: dict):
    data["_cached_at"] = datetime.now().isoformat()
    path = CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _scrape_complex_info_old(apt_name: str) -> dict | None:
    with _lock:
        page = _make_page()
        try:
            url = f"{LAND_OLD}/search/complex.naver?tab=complex&query={apt_name}"
            logger.info(f"[complex_info] Navigating to {url}")
            page.goto(url, wait_until="networkidle", timeout=20000)
            time.sleep(2)

            table = page.locator("table").first
            if table.count() == 0:
                logger.warning(f"[complex_info] No table found for {apt_name}")
                logger.info(f"[complex_info] Page title: {page.title()}")
                logger.info(f"[complex_info] URL after nav: {page.url}")
                return None

            text = (table.text_content() or "").replace("\xa0", " ")
            text = re.sub(r"\s+", " ", text).strip()

            if "규모" in text and "건설사" in text:
                households = ""
                floors = ""
                규모 = re.search(r"규모\s+(.+?)(?:\s+건설사|$)", text)
                if 규모:
                    h_match = re.search(r"총\s*(\d+)세대", 규모.group(1))
                    f_match = re.search(r"총\s*(\d+)층", 규모.group(1))
                    if h_match:
                        households = h_match.group(1)
                    if f_match:
                        floors = f_match.group(1)

                입주 = re.search(r"입주일자\s+(\S+)", text)
                건설사 = re.search(r"건설사\s+(.+?)(?:\s+교통|$)", text)
                면적 = re.search(r"면적\s+(.+?)(?:\s+단지사진|$)", text)
                소재지 = re.search(r"소재지\s+(.+?)(?:\s+입주일자|$)", text)

                return {
                    "name": apt_name,
                    "address": 소재지.group(1).strip() if 소재지 else "",
                    "totalHouseholdCount": int(households) if households else 0,
                    "highFloor": floors,
                    "lowFloor": "",
                    "useApproveYmd": 입주.group(1).strip() if 입주 else "",
                    "builder": 건설사.group(1).strip() if 건설사 else "",
                    "areas": 면적.group(1).strip() if 면적 else "",
                    "dealCount": 0,
                    "leaseCount": 0,
                    "pyeongList": [],
                }

            rows = page.locator("table tr")
            for i in range(rows.count()):
                all_cells = page.locator(f"table tr:nth-child({i+1}) td, table tr:nth-child({i+1}) th")
                cell_texts = []
                for j in range(all_cells.count()):
                    ct = (all_cells.nth(j).text_content() or "").replace("\xa0", " ")
                    ct = re.sub(r"\s+", " ", ct).strip()
                    cell_texts.append(ct)

                for idx, ct in enumerate(cell_texts):
                    if ct == apt_name:
                        address = cell_texts[idx - 1] if idx >= 1 else ""
                        areas = cell_texts[idx + 1] if idx + 1 < len(cell_texts) else ""
                        입주일 = cell_texts[idx + 2] if idx + 2 < len(cell_texts) else ""
                        세대수 = cell_texts[idx + 3] if idx + 3 < len(cell_texts) else "0"
                        매물 = cell_texts[idx + 5] if idx + 5 < len(cell_texts) else "0/0/0"

                        deals = re.findall(r"\d+", 매물)
                        return {
                            "name": apt_name,
                            "address": address,
                            "totalHouseholdCount": int(세대수) if 세대수.isdigit() else 0,
                            "highFloor": "",
                            "lowFloor": "",
                            "useApproveYmd": 입주일,
                            "builder": "",
                            "areas": areas,
                            "dealCount": int(deals[0]) if deals else 0,
                            "leaseCount": int(deals[1]) if len(deals) > 1 else 0,
                            "pyeongList": [],
                        }

            logger.warning(f"[complex_info] No matching row for {apt_name}")
            return None
        except Exception as e:
            logger.error(f"[complex_info] Error scraping {apt_name}: {e}")
            return None
        finally:
            page.context.close()


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


# --- Public API ---

def get_complex_info(apt_id: str) -> dict | None:
    apt = APARTMENTS.get(apt_id)
    if not apt:
        return None

    # Use static info from config if available
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

    # Fallback: scrape from Naver
    cache = _read_cache(f"info_{apt_id}", CACHE_TTL_LONG)
    if cache:
        cache.pop("_cached_at", None)
        return cache

    complex_no = apt.get("complex_no", "")
    info = _scrape_complex_info_old(apt["name"])

    if info:
        info["complexNo"] = complex_no
        _write_cache(f"info_{apt_id}", info)

    return info


def save_listings_cache(apt_id: str, listings: list[dict]):
    """Save listings data pushed from a local scraper."""
    _write_cache(f"listings_{apt_id}", {"listings": listings})


def get_listings(apt_id: str) -> list[dict]:
    # Check cache first (30min TTL for scraped data)
    cache = _read_cache(f"listings_{apt_id}", CACHE_TTL_SHORT)
    if cache and "listings" in cache:
        logger.info(f"[get_listings] Returning {len(cache['listings'])} cached listings for {apt_id}")
        return cache["listings"]

    apt = APARTMENTS.get(apt_id)
    if not apt or "complex_no" not in apt:
        return []

    # Use old land.naver.com domain (not rate-limited)
    listings = _fetch_listings_old_domain(apt["name"], apt["complex_no"])

    if listings:
        _write_cache(f"listings_{apt_id}", {"listings": listings})
    return listings


def get_price_trend(apt_id: str, years: int = 5) -> dict | None:
    cache = _read_cache(f"trend_{apt_id}", CACHE_TTL_SHORT)
    if cache:
        cache.pop("_cached_at", None)
        return cache

    # Price trend from new.land.naver.com is likely rate-limited
    # Return None gracefully - the dashboard shows 실거래가 chart instead
    logger.info(f"[get_price_trend] No cached trend for {apt_id}, skipping (rate-limited)")
    return None
