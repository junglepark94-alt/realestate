import os
import logging
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from config import APARTMENTS
from services.public_data import get_transactions, get_monthly_summary
from services.naver_land import get_complex_info, get_listings_with_meta, get_price_trend, save_listings_cache
import cache

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

STATIC_DIR = Path(__file__).parent / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")
CORS(app)


def _recent_deal_price(apt_id):
    """Latest 매매 실거래가 (만원) from cache only — no live fetch.

    Returns the most recent transaction's price across all area types, or None
    if no transaction cache yet. Used to flag budget-friendly apartments in the
    selector tabs.
    """
    for months in (24, 12):
        c = cache.read_json(f"transactions_{apt_id}_{months}")
        data = c.get("data") if c else None
        if data:
            return data[-1].get("price")  # data is sorted ascending by date
    return None


@app.route("/api/apartments")
def apartments():
    result = []
    for apt_id, apt in APARTMENTS.items():
        try:
            info = get_complex_info(apt_id)
        except Exception as e:
            logging.error(f"get_complex_info({apt_id}) failed: {e}")
            info = None
        result.append({
            "id": apt_id,
            "name": apt["name"],
            "dong": apt["dong"],
            "gu": apt["gu"],
            "complexNo": apt.get("complex_no"),
            "hiddenAreaTypes": apt.get("hidden_area_types", []),
            "recentPrice": _recent_deal_price(apt_id),
            "naverInfo": info,
        })
    return jsonify(result)


@app.route("/api/transactions/<apt_id>")
def transactions(apt_id):
    apt = APARTMENTS.get(apt_id)
    if not apt:
        return jsonify({"error": "아파트를 찾을 수 없습니다"}), 404

    months = request.args.get("months", 12, type=int)
    try:
        data = get_transactions(apt, months, apt_id=apt_id)
        summary = get_monthly_summary(transactions=data)
    except Exception as e:
        return jsonify({"error": str(e), "transactions": [], "summary": []})
    return jsonify({"transactions": data, "summary": summary})


@app.route("/api/listings/<apt_id>")
def listings(apt_id):
    if apt_id not in APARTMENTS:
        return jsonify({"error": "아파트를 찾을 수 없습니다"}), 404

    try:
        data = get_listings_with_meta(apt_id)
    except Exception as e:
        logging.error(f"get_listings_with_meta({apt_id}) failed: {e}")
        data = {"listings": [], "updatedAt": None}
    return jsonify(data)


@app.route("/api/price-trend/<apt_id>")
def price_trend(apt_id):
    if apt_id not in APARTMENTS:
        return jsonify({"error": "아파트를 찾을 수 없습니다"}), 404

    years = request.args.get("years", 5, type=int)
    try:
        data = get_price_trend(apt_id, years)
    except Exception as e:
        logging.error(f"get_price_trend({apt_id}) failed: {e}")
        data = None
    return jsonify({"priceTrend": data})


SYNC_KEY = os.environ.get("SYNC_KEY", "")


@app.route("/api/sync-listings", methods=["POST"])
def sync_listings():
    """Receive listing data pushed from a local scraper (Korean IP)."""
    key = request.headers.get("X-Sync-Key", "")
    if not SYNC_KEY or key != SYNC_KEY:
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data or "apt_id" not in data or "listings" not in data:
        return jsonify({"error": "invalid payload"}), 400

    apt_id = data["apt_id"]
    if apt_id not in APARTMENTS:
        return jsonify({"error": "unknown apartment"}), 404

    save_listings_cache(apt_id, data["listings"])
    logging.info(f"[sync] Received {len(data['listings'])} listings for {apt_id}")
    return jsonify({"ok": True, "count": len(data["listings"])})


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    file = STATIC_DIR / path
    if path and file.exists():
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


# Start background scheduler (startup refresh + daily 06:00 KST)
from scheduler import start_scheduler
start_scheduler()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") != "production"
    app.run(debug=debug, host="0.0.0.0", port=port)
