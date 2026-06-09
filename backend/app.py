import os
import logging
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from config import APARTMENTS
from services.public_data import get_transactions, get_monthly_summary
from services.naver_land import get_complex_info, get_listings, get_price_trend

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

STATIC_DIR = Path(__file__).parent / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")
CORS(app)


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
        data = get_transactions(apt, months)
        summary = get_monthly_summary(transactions=data)
    except Exception as e:
        return jsonify({"error": str(e), "transactions": [], "summary": []})
    return jsonify({"transactions": data, "summary": summary})


@app.route("/api/listings/<apt_id>")
def listings(apt_id):
    if apt_id not in APARTMENTS:
        return jsonify({"error": "아파트를 찾을 수 없습니다"}), 404

    try:
        data = get_listings(apt_id)
    except Exception as e:
        logging.error(f"get_listings({apt_id}) failed: {e}")
        data = []
    return jsonify({"listings": data})


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


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    file = STATIC_DIR / path
    if path and file.exists():
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") != "production"
    app.run(debug=debug, host="0.0.0.0", port=port)
