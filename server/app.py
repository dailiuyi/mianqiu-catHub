"""FastAPI 只读 Bot HTTP 服务与静态站点 (server/app.py)

作者署名：쯔니（zzni）｜Kakao 系列：몽실몽실 냥냥이（棉球小猫）
目标：个人表情库网站与面向第三方 QQ Bot 的只读 HTTP 接口约定
"""

import os
import json
import random
import asyncio
import hashlib
import logging
import threading
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional, List, Dict, Any
from fastapi import Body, FastAPI, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
IMAGES_DIR = os.path.join(BASE_DIR, "images")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# 统计数据落盘位置；生产由 systemd 的 StateDirectory 指到 /var/lib/mianqiu-cathub
STATS_PATH = os.environ.get("MIANQIU_STATS_PATH") or os.path.join(BASE_DIR, ".state", "stats.json")

logger = logging.getLogger("mianqiu.stats")


def _visitor_hash(visitor: str) -> int:
    """把浏览器里的随机访客 id 压成 64 位整数，避免统计文件随访客线性膨胀"""
    return int(hashlib.sha256(visitor.encode("utf-8")).hexdigest()[:16], 16)


class StatsStore:
    """接口调用量与页面浏览量的进程内计数，定期原子落盘。

    仅适用于单 worker：多进程会各存一份、互相覆盖。
    """

    FLUSH_INTERVAL = 10.0
    VISITOR_CAP = 100_000

    def __init__(self, path: str):
        self._path = path
        self._lock = threading.Lock()
        self._loaded = False
        self._dirty = False
        self._api_calls = 0
        self._page_views = 0
        self._visitors: set = set()
        self._since = ""

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        try:
            with open(self._path, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except FileNotFoundError:
            self._since = date.today().isoformat()
            self._dirty = True
            return
        except (OSError, ValueError, TypeError):
            # 文件被写坏就重开，宁可统计归零也不要让 Bot API 起不来
            logger.warning("stats 文件无法读取，重新开始计数: %s", self._path)
            self._since = date.today().isoformat()
            self._dirty = True
            return
        self._api_calls = int(raw.get("api_calls", 0))
        self._page_views = int(raw.get("page_views", 0))
        self._visitors = set(raw.get("visitors", []))
        self._since = raw.get("since") or date.today().isoformat()

    def _mark_dirty(self) -> None:
        self._dirty = True

    def _flush_locked(self) -> None:
        if not self._dirty:
            return
        payload = {
            "api_calls": self._api_calls,
            "page_views": self._page_views,
            "visitors": sorted(self._visitors),
            "since": self._since,
        }
        try:
            os.makedirs(os.path.dirname(self._path), exist_ok=True)
            tmp_path = self._path + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp_path, self._path)
        except OSError as exc:
            # 统计写不进去不能拖垮只读接口
            logger.warning("stats 落盘失败: %s", exc)
            return
        self._dirty = False

    def add_api_call(self) -> None:
        with self._lock:
            self._load()
            self._api_calls += 1
            self._mark_dirty()

    def add_page_view(self, visitor: str) -> None:
        with self._lock:
            self._load()
            self._page_views += 1
            if visitor and len(self._visitors) < self.VISITOR_CAP:
                self._visitors.add(_visitor_hash(visitor))
            self._mark_dirty()

    def flush(self) -> None:
        with self._lock:
            self._load()
            self._flush_locked()

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            self._load()
            return {
                "api_calls": self._api_calls,
                "page_views": self._page_views,
                "visitors": len(self._visitors),
                "since": self._since,
            }


STATS = StatsStore(STATS_PATH)


async def _flush_stats_periodically() -> None:
    while True:
        await asyncio.sleep(StatsStore.FLUSH_INTERVAL)
        STATS.flush()


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(_flush_stats_periodically())
    try:
        yield
    finally:
        task.cancel()
        STATS.flush()


app = FastAPI(
    title="棉球小猫表情库 (mianqiu-catHub) API",
    description="作者：쯔니 (zzni) | 系列：몽실몽실 냥냥이 (棉球小猫) | 第三方 QQ Bot 只读 HTTP 接口",
    version="1.0.0",
    lifespan=lifespan,
)

# 允许跨域（方便第三方 Bot 和前端跨域访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


@app.middleware("http")
async def count_bot_api_calls(request: Request, call_next):
    """统计真实的外部 Bot 接口调用；本机健康检查和 CORS 预检不算"""
    response = await call_next(request)
    path = request.url.path
    if (
        request.method != "OPTIONS"
        and path.startswith("/api/v1/bot/")
        and (request.client is None or request.client.host not in LOOPBACK_HOSTS)
    ):
        STATS.add_api_call()
    return response


def load_memes_data() -> Dict[str, Any]:
    """读取 memes.json 数据，若无则返回空列表"""
    path = os.path.join(DATA_DIR, "memes.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"total": 0, "memes": []}


def load_tags_data() -> List[Dict[str, Any]]:
    path = os.path.join(DATA_DIR, "tags.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f).get("tags", [])
        except Exception:
            pass
    return []


def load_series_data() -> List[Dict[str, Any]]:
    path = os.path.join(DATA_DIR, "series.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f).get("series", [])
        except Exception:
            pass
    return []


def format_meme_item(item: Dict[str, Any], base_url: str) -> Dict[str, Any]:
    """格式化单条表情元数据，拼接绝对 URL"""
    raw_rel = item.get("url", "")
    thumb_rel = item.get("thumb_url", "")
    full_url = f"{base_url.rstrip('/')}/{raw_rel.lstrip('/')}" if raw_rel else ""
    full_thumb_url = f"{base_url.rstrip('/')}/{thumb_rel.lstrip('/')}" if thumb_rel else ""

    return {
        "id": item.get("id", ""),
        "title": item.get("title", ""),
        "title_ko": item.get("title_ko", ""),
        "series": item.get("series", ""),
        "author": item.get("author", "쯔니 (zzni)"),
        "is_animated": item.get("is_animated", False),
        "format": item.get("format", ""),
        "width": item.get("width", 0),
        "height": item.get("height", 0),
        "tags": item.get("tags", []),
        "ocr_text": item.get("ocr_text", ""),
        "url": full_url,
        "thumb_url": full_thumb_url,
    }


# ==================== 第三方 QQ Bot 只读 API ====================

@app.get("/api/v1/bot/random", summary="随机获取表情")
async def bot_get_random(
    request: Request,
    series: Optional[str] = Query(None, description="按套系过滤，如 Kakao-Vol.1"),
    tag: Optional[str] = Query(None, description="按标签过滤，如 可爱, 动图"),
    animated: Optional[bool] = Query(None, description="是否动图"),
):
    memes_data = load_memes_data()
    items = memes_data.get("memes", [])
    if not items:
        return JSONResponse(status_code=404, content={"code": 404, "msg": "表情库暂无数据", "data": None})

    filtered = items
    if series:
        filtered = [x for x in filtered if x.get("series", "").lower() == series.lower()]
    if tag:
        filtered = [x for x in filtered if tag in x.get("tags", [])]
    if animated is not None:
        filtered = [x for x in filtered if x.get("is_animated", False) == animated]

    if not filtered:
        return JSONResponse(status_code=404, content={"code": 404, "msg": "未找到符合过滤条件的表情", "data": None})

    chosen = random.choice(filtered)
    base_url = str(request.base_url)
    return {
        "code": 0,
        "msg": "ok",
        "data": format_meme_item(chosen, base_url),
    }


@app.get("/api/v1/bot/search", summary="关键词与标签搜索表情")
async def bot_search(
    request: Request,
    q: str = Query(..., description="搜索关键词（支持中文、拼音、韩文、OCR 文本）"),
    limit: int = Query(10, ge=1, le=50, description="返回数量上限"),
    offset: int = Query(0, ge=0, description="分页偏移量"),
):
    memes_data = load_memes_data()
    items = memes_data.get("memes", [])
    query = q.strip().lower()

    if not query:
        return {"code": 0, "msg": "ok", "data": {"total": 0, "items": []}}

    matched = []
    for item in items:
        title = item.get("title", "").lower()
        title_ko = item.get("title_ko", "").lower()
        ocr_text = item.get("ocr_text", "").lower()
        tags = [t.lower() for t in item.get("tags", [])]
        pinyin = item.get("pinyin", "").lower()
        pinyin_first = item.get("pinyin_first", "").lower()

        # 匹配标题、韩文、标签、OCR文字、拼音或拼音首字母
        if (
            query in title
            or query in title_ko
            or query in ocr_text
            or any(query in t for t in tags)
            or query in pinyin
            or query in pinyin_first
        ):
            matched.append(item)

    total = len(matched)
    paged = matched[offset : offset + limit]
    base_url = str(request.base_url)

    return {
        "code": 0,
        "msg": "ok",
        "data": {
            "total": total,
            "items": [format_meme_item(it, base_url) for it in paged],
        },
    }


@app.get("/api/v1/bot/emotes/{emote_id}", summary="获取单张表情元数据")
async def bot_get_emote(request: Request, emote_id: str):
    memes_data = load_memes_data()
    items = memes_data.get("memes", [])
    for it in items:
        if it.get("id") == emote_id:
            base_url = str(request.base_url)
            return {
                "code": 0,
                "msg": "ok",
                "data": format_meme_item(it, base_url),
            }
    raise HTTPException(status_code=404, detail="Emote not found")


@app.get("/api/v1/bot/tags", summary="获取所有标签与数量")
async def bot_get_tags():
    tags = load_tags_data()
    return {"code": 0, "msg": "ok", "data": tags}


@app.get("/api/v1/bot/series", summary="获取所有套系与数量")
async def bot_get_series():
    series = load_series_data()
    return {"code": 0, "msg": "ok", "data": series}


@app.get("/api/v1/bot/summary", summary="获取表情库整体统计")
async def bot_get_summary():
    memes_data = load_memes_data()
    items = memes_data.get("memes", [])
    animated_cnt = sum(1 for x in items if x.get("is_animated", False))
    return {
        "code": 0,
        "msg": "ok",
        "data": {
            "author": "쯔니 (zzni)",
            "series_name": "몽실몽실 냥냥이 (棉球小猫)",
            "total_emotes": len(items),
            "animated_count": animated_cnt,
            "static_count": len(items) - animated_cnt,
            "series_count": len(load_series_data()),
            "tags_count": len(load_tags_data()),
        },
    }


# ==================== 站点真实访问统计 ====================

@app.get("/api/stats", summary="站点真实接口调用与页面浏览")
async def get_stats():
    return {"code": 0, "msg": "ok", "data": STATS.snapshot()}


@app.post("/api/stats/view", status_code=204, summary="记录一次页面浏览")
async def record_page_view(payload: Optional[Dict[str, Any]] = Body(default=None)):
    visitor = str((payload or {}).get("visitor") or "")[:64]
    STATS.add_page_view(visitor)
    return Response(status_code=204)


# ==================== 静态文件挂载与页面路由 ====================

if os.path.exists(IMAGES_DIR):
    app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")

if os.path.exists(DATA_DIR):
    app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/", include_in_schema=False)
    async def index_page():
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"status": "ok", "message": "mianqiu-catHub API is running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.app:app", host="0.0.0.0", port=8000, reload=True)
