"""测试共用夹具：把访问统计写到临时目录，避免污染仓库和互相串数"""

import pytest
from server.app import StatsStore
import server.app as app_module


@pytest.fixture(autouse=True)
def isolated_stats(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "STATS", StatsStore(str(tmp_path / "stats.json")))
