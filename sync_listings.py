"""
로컬(한국 IP)에서 네이버 부동산 매물을 스크래핑하고 Railway 서버로 전송하는 스크립트.

사용법:
  python sync_listings.py

환경변수:
  RAILWAY_URL  - Railway 앱 URL (예: https://realestate-production-e541.up.railway.app)
  SYNC_KEY     - Railway 환경변수에 설정한 동기화 키
"""

import os
import sys
import json
import time
import requests
import urllib3
from playwright.sync_api import sync_playwright

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

RAILWAY_URL = os.environ.get("RAILWAY_URL", "").rstrip("/")
SYNC_KEY = os.environ.get("SYNC_KEY", "")

# Single source of truth: pull the apartment list from backend/config.py so this
# fallback scraper never drifts from the server's registered complexes.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))
from config import APARTMENTS as _APARTMENTS  # noqa: E402

APARTMENTS = {
    apt_id: {"name": apt["name"], "complex_no": apt["complex_no"]}
    for apt_id, apt in _APARTMENTS.items()
}

LAND_NEW = "https://fin.land.naver.com"


def scrape_listings(browser, complex_no):
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
    page.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => false });")

    try:
        page.goto(f"{LAND_NEW}/complexes/{complex_no}", wait_until="load", timeout=15000)
        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass
        time.sleep(2)

        # Try new.land API first
        api_url = (
            f"https://new.land.naver.com/api/articles/complex/{complex_no}"
            f"?realEstateType=APT&tradeType=&page=1&sizePerPage=50"
        )
        result = page.evaluate("""async (url) => {
            try {
                const r = await fetch(url);
                if (!r.ok) return { _error: r.status };
                return await r.json();
            } catch(e) {
                return { _error: e.message };
            }
        }""", api_url)

        if not result or "_error" in result:
            # Try fin.land API
            api_url2 = (
                f"{LAND_NEW}/front-api/v1/article/list"
                f"?complexNumber={complex_no}&tradeType=&page=0&size=50"
            )
            result = page.evaluate("""async (url) => {
                try {
                    const r = await fetch(url);
                    if (!r.ok) return { _error: r.status };
                    return await r.json();
                } catch(e) {
                    return { _error: e.message };
                }
            }""", api_url2)

        if not result or "_error" in result:
            print(f"  API failed: {result}")
            return []

        articles = result.get("articleList", [])
        if not articles and "result" in result:
            articles = result["result"] if isinstance(result["result"], list) else []

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
        return listings

    except Exception as e:
        print(f"  Scrape error: {e}")
        return []
    finally:
        ctx.close()


def push_to_railway(apt_id, listings):
    url = f"{RAILWAY_URL}/api/sync-listings"
    resp = requests.post(
        url,
        json={"apt_id": apt_id, "listings": listings},
        headers={"X-Sync-Key": SYNC_KEY},
        timeout=10,
        verify=False,
    )
    return resp.status_code, resp.json()


def main():
    if not RAILWAY_URL:
        print("RAILWAY_URL 환경변수를 설정하세요.")
        print('  set RAILWAY_URL=https://your-app.up.railway.app')
        sys.exit(1)
    if not SYNC_KEY:
        print("SYNC_KEY 환경변수를 설정하세요.")
        print('  set SYNC_KEY=your-secret-key')
        sys.exit(1)

    print(f"Railway: {RAILWAY_URL}")
    print(f"아파트 {len(APARTMENTS)}개 스크래핑 시작\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )

        for apt_id, apt in APARTMENTS.items():
            print(f"[{apt['name']}] 스크래핑 중...")
            listings = scrape_listings(browser, apt["complex_no"])
            print(f"  매물 {len(listings)}건 수집")

            if listings:
                status, resp = push_to_railway(apt_id, listings)
                print(f"  Railway 전송: {status} {resp}")
            else:
                print("  매물 없음, 전송 스킵")

            time.sleep(2)  # 요청 간격

        browser.close()

    print("\n완료!")


if __name__ == "__main__":
    main()
