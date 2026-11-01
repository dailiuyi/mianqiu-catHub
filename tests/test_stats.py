"""测试真实访问统计 (tests/test_stats.py)"""

from starlette.testclient import TestClient

from server.app import app, StatsStore
import server.app as app_module

client = TestClient(app)


def stats():
    return client.get("/api/stats").json()["data"]


def test_bot_calls_counted_but_stats_endpoints_are_not():
    assert stats()["api_calls"] == 0

    client.get("/api/v1/bot/summary")
    client.get("/api/v1/bot/random")
    assert stats()["api_calls"] == 2

    # 统计接口自己不算接口调用
    client.get("/api/stats")
    assert stats()["api_calls"] == 2


def test_cors_preflight_not_counted():
    client.options("/api/v1/bot/random", headers={"Origin": "https://bot.example"})
    assert stats()["api_calls"] == 0


def test_loopback_requests_not_counted():
    local = TestClient(app, client=("127.0.0.1", 50000))
    local.get("/api/v1/bot/summary")
    local.get("/api/v1/bot/random")
    assert stats()["api_calls"] == 0


def test_page_view_counts_views_and_dedupes_visitors():
    client.post("/api/stats/view", json={"visitor": "visitor-a"})
    client.post("/api/stats/view", json={"visitor": "visitor-a"})
    client.post("/api/stats/view", json={"visitor": "visitor-b"})

    data = stats()
    assert data["page_views"] == 3
    assert data["visitors"] == 2


def test_stats_survive_restart(tmp_path):
    store = StatsStore(str(tmp_path / "stats.json"))
    store.add_api_call()
    store.add_page_view("visitor-a")
    store.add_page_view("visitor-a")
    store.flush()

    reopened = StatsStore(str(tmp_path / "stats.json"))
    data = reopened.snapshot()
    assert data["api_calls"] == 1
    assert data["page_views"] == 2
    assert data["visitors"] == 1
    assert data["since"]


def test_since_is_date_of_first_record(tmp_path):
    store = StatsStore(str(tmp_path / "stats.json"))
    assert store.snapshot()["since"]
