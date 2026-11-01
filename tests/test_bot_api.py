"""测试第三方 QQ Bot 只读 API (tests/test_bot_api.py)"""

import pytest
from starlette.testclient import TestClient
from server.app import app

client = TestClient(app)


def test_bot_summary():
    resp = client.get("/api/v1/bot/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 0
    assert "data" in data
    assert "total_emotes" in data["data"]
    assert data["data"]["author"] == "쯔니 (zzni)"


def test_bot_random():
    resp = client.get("/api/v1/bot/random")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 0
    item = data["data"]
    assert "id" in item
    assert "url" in item
    assert "thumb_url" in item
    assert "title" in item


def test_bot_random_filter_series():
    resp = client.get("/api/v1/bot/random?series=Kakao-Vol.1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 0
    assert data["data"]["series"] == "Kakao-Vol.1"


def test_bot_search_chinese_and_pinyin():
    # 搜索中文 "棉球小猫"
    resp = client.get("/api/v1/bot/search?q=棉球小猫")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 0
    assert data["data"]["total"] > 0

    # 搜索拼音首字母 "mqxm"
    resp_py = client.get("/api/v1/bot/search?q=mqxm")
    assert resp_py.status_code == 200
    assert resp_py.json()["data"]["total"] > 0


def test_bot_get_tags():
    resp = client.get("/api/v1/bot/tags")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 0
    assert isinstance(data["data"], list)


def test_bot_get_series():
    resp = client.get("/api/v1/bot/series")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 0
    assert isinstance(data["data"], list)


def test_bot_emote_detail():
    resp = client.get("/api/v1/bot/emotes/kakao-01-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 0
    assert data["data"]["id"] == "kakao-01-01"


def test_index_page():
    resp = client.get("/")
    assert resp.status_code == 200
    assert "棉球小猫表情库" in resp.text
