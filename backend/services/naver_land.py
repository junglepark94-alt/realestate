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
LAND_NEW = "https://fin.land.naver.com"


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


def _fetch_api_via_page(complex_no: str, api_url: str) -> dict | list | None:
    with _lock:
        page = _make_page()
        try:
            target = f"{LAND_NEW}/complexes/{complex_no}"
            logger.info(f"[api_via_page] Navigating to {target}")
            page.goto(target, wait_until="load", timeout=10000)
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                logger.info("[api_via_page] networkidle timeout, proceeding anyway")
            logger.info(f"[api_via_page] Page URL: {page.url}")

            logger.info(f"[api_via_page] Fetching {api_url}")
            result = page.evaluate("""async (url) => {
                try {
                    const c = new AbortController();
                    const t = setTimeout(() => c.abort(), 8000);
                    const r = await fetch(url, { signal: c.signal });
                    clearTimeout(t);
                    if (!r.ok) return { _error: r.status };
                    return await r.json();
                } catch(e) {
                    return { _error: e.message };
                }
            }""", api_url)

            if result and "_error" not in result:
                logger.info(f"[api_via_page] Success, articles: {len(result.get('articleList', []))}")
                return result
            logger.warning(f"[api_via_page] Failed: {result}")
            return None
        except Exception as e:
            logger.error(f"[api_via_page] Error: {e}")
            return None
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


def get_listings(apt_id: str) -> list[dict]:
    cache = _read_cache(f"listings_{apt_id}", CACHE_TTL_SHORT)
    if cache and "listings" in cache:
        return cache["listings"]

    apt = APARTMENTS.get(apt_id)
    if not apt or "complex_no" not in apt:
        return []

    complex_no = apt["complex_no"]

    url = (
        f"https://new.land.naver.com/api/articles/complex/{complex_no}"
        f"?realEstateType=APT&tradeType=&page=1&sizePerPage=50"
    )
    data = _fetch_api_via_page(complex_no, url)

    if not data:
        url2 = (
            f"{LAND_NEW}/front-api/v1/article/list"
            f"?complexNumber={complex_no}&tradeType=&page=0&size=50"
        )
        data = _fetch_api_via_page(complex_no, url2)

    if not data:
        return []

    articles = data.get("articleList", [])
    if not articles and "result" in data:
        articles = data["result"] if isinstance(data["result"], list) else []

    listings = []
    for a in articles:
        listings.append({
            "articleNo": a.get("articleNo", a.get("itemId", "")),
            "articleName": a.get("articleName", a.get("complexName", "")),
            "tradeType": a.get("tradeTypeName", a.get("tradeType", "")),
            "price": a.get("dealOrWarrantPrc", a.get("price", "")),
            "area": a.get("area2", a.get("exclusiveArea", 0)),
            "areaName": a.get("areaName", ""),
            "floor": a.get("floorInfo", a.get("floor", "")),
            "direction": a.get("direction", ""),
            "articleConfirmYmd": a.get("articleConfirmYmd", a.get("confirmDate", "")),
            "articleFeatureDesc": a.get("articleFeatureDesc", a.get("description", "")),
            "realtorName": a.get("realtorName", ""),
        })

    if listings:
        _write_cache(f"listings_{apt_id}", {"listings": listings})
    return listings


def get_price_trend(apt_id: str, years: int = 5) -> dict | None:
    cache = _read_cache(f"trend_{apt_id}", CACHE_TTL_SHORT)
    if cache:
        cache.pop("_cached_at", None)
        return cache

    apt = APARTMENTS.get(apt_id)
    if not apt or "complex_no" not in apt:
        return None

    complex_no = apt["complex_no"]
    url = (
        f"https://new.land.naver.com/api/complexes/{complex_no}/prices"
        f"?complexNo={complex_no}&tradeType=A1&year={years}"
        f"&priceChartChange=true&areaNo=&type=chart"
    )
    data = _fetch_api_via_page(complex_no, url)

    if data:
        _write_cache(f"trend_{apt_id}", data)
    return data
