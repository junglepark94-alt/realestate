import os
from dotenv import load_dotenv

load_dotenv()

PUBLIC_DATA_API_KEY = os.getenv("PUBLIC_DATA_API_KEY", "")

APARTMENTS = {
    "hongje-hanyang": {
        "name": "홍제한양",
        "dong": "홍제동",
        "gu": "서대문구",
        "lawd_cd": "11410",
        "complex_no": "7961",
        "search_names": ["홍제한양", "홍제 한양"],
        "info": {
            "address": "서울시 서대문구 홍제동",
            "totalHouseholdCount": 998,
            "highFloor": "15",
            "useApproveYmd": "1993.05",
            "builder": "(주)한양",
            "areas": "76㎡, 95㎡, 131㎡",
        },
    },
    "hillstate-nokbun": {
        "name": "힐스테이트녹번",
        "dong": "녹번동",
        "gu": "은평구",
        "lawd_cd": "11380",
        "complex_no": "111964",
        "search_names": ["힐스테이트녹번", "힐스테이트 녹번"],
        "hidden_area_types": ["39", "49"],
        "info": {
            "address": "서울시 은평구 녹번동",
            "totalHouseholdCount": 952,
            "highFloor": "",
            "useApproveYmd": "2019.05",
            "builder": "현대엔지니어링(주)",
            "areas": "66~156㎡",
        },
    },
    "hongjewon-hyundai": {
        "name": "홍제원현대",
        "dong": "홍제동",
        "gu": "서대문구",
        "lawd_cd": "11410",
        "complex_no": "26841",
        "search_names": ["홍제원현대", "홍제원 현대"],
        "info": {
            "address": "서울시 서대문구 홍제동",
            "totalHouseholdCount": 939,
            "highFloor": "18",
            "useApproveYmd": "2000.06",
            "builder": "현대건설(주)",
            "areas": "82㎡, 107㎡, 140㎡",
        },
    },
}
