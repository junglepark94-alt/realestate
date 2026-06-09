import json
import logging
import requests
import urllib3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from config import PUBLIC_DATA_API_KEY

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger(__name__)

BASE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
CACHE_DIR = Path(__file__).parent.parent / ".cache"
CACHE_DIR.mkdir(exist_ok=True)
# Long TTL — scheduler refreshes daily, this is just a safety net
CACHE_TTL_TRANSACTIONS = timedelta(days=7)


def _fetch_month(lawd_cd: str, deal_ymd: str) -> list[dict]:
    url = (
        f"{BASE_URL}?serviceKey={PUBLIC_DATA_API_KEY}"
        f"&LAWD_CD={lawd_cd}&DEAL_YMD={deal_ymd}&pageNo=1&numOfRows=1000"
    )
    resp = requests.get(url, timeout=10, verify=False)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.content, "xml")

    result_code = soup.select_one("resultCode")
    if result_code and result_code.text.strip() not in ("00", "000"):
        return []

    items = []
    for item in soup.select("item"):
        items.append({tag.name: tag.text.strip() for tag in item.find_all()})
    return items


def get_transactions(apt_config: dict, months: int = 12, force_refresh: bool = False) -> list[dict]:
    apt_name_key = apt_config["search_names"][0].replace(" ", "")
    cache_key = f"transactions_{apt_name_key}_{months}"
    cache_path = CACHE_DIR / f"{cache_key}.json"

    # Return cache unless forced
    if not force_refresh and cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            cached_at = datetime.fromisoformat(cached.get("_cached_at", "2000-01-01"))
            if datetime.now() - cached_at < CACHE_TTL_TRANSACTIONS:
                logger.info(f"[transactions] Cache hit for {apt_name_key} ({len(cached['data'])} items)")
                return cached["data"]
        except Exception:
            pass

    lawd_cd = apt_config["lawd_cd"]
    search_names = apt_config["search_names"]
    now = datetime.now()

    ymds = [(now - relativedelta(months=i)).strftime("%Y%m") for i in range(months)]

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda ymd: _fetch_month(lawd_cd, ymd), ymds))

    all_items = []
    for items in results:
        for item in items:
            apt_name = item.get("aptNm", "")
            if any(name in apt_name for name in search_names):
                deal_amount = item.get("dealAmount", "0").replace(",", "").strip()
                try:
                    price = int(deal_amount)
                except ValueError:
                    price = 0
                all_items.append({
                    "date": f"{item.get('dealYear', '')}-{item.get('dealMonth', '').zfill(2)}-{item.get('dealDay', '').zfill(2)}",
                    "price": price,
                    "area": float(item.get("excluUseAr", "0")),
                    "floor": item.get("floor", ""),
                    "buildYear": item.get("buildYear", ""),
                    "aptName": apt_name,
                    "dealMonth": f"{item.get('dealYear', '')}-{item.get('dealMonth', '').zfill(2)}",
                })

    all_items.sort(key=lambda x: x["date"])

    # Write cache
    cache_path.write_text(
        json.dumps({"_cached_at": datetime.now().isoformat(), "data": all_items}, ensure_ascii=False),
        encoding="utf-8",
    )
    logger.info(f"[transactions] Refreshed & cached {len(all_items)} items for {apt_name_key}")
    return all_items


def get_monthly_summary(apt_config: dict = None, months: int = 12, transactions: list[dict] | None = None) -> list[dict]:
    if transactions is None:
        transactions = get_transactions(apt_config, months)

    monthly: dict[str, list[int]] = {}
    for t in transactions:
        key = t["dealMonth"]
        monthly.setdefault(key, []).append(t["price"])

    summary = []
    for month, prices in sorted(monthly.items()):
        summary.append({
            "month": month,
            "avg": round(sum(prices) / len(prices)),
            "min": min(prices),
            "max": max(prices),
            "count": len(prices),
        })
    return summary
