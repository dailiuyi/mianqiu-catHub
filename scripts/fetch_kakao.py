"""Kakao Emoticon Shop 官方表情包抓取与导入脚本 (scripts/fetch_kakao.py)

作者：쯔니 (zzni)
官方系列：몽실몽실 냥냥이 (棉球小猫)
"""

import os
import sys
import json
import argparse
import logging
from typing import Dict, Any, List, Optional
import httpx
from PIL import Image
import io

from scripts.image_utils import detect_image_format, calculate_sha256, compute_dhash, generate_thumbnail

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

# Kakao 官方已上架「棉球小猫 / 냥냥이」主线与迷你系列 slug 列表
KAKAO_SERIES_CATALOG = [
    {"vol": 1, "slug": "fluffy-meow-meow", "title_ko": "몽실몽실 냥냥이", "title_zh": "棉球小猫 第1弹", "series_id": "Kakao-Vol.1"},
    {"vol": 2, "slug": "fluffy-meow-meow-2", "title_ko": "몽실몽실 냥냥이 2", "title_zh": "棉球小猫 第2弹", "series_id": "Kakao-Vol.2"},
    {"vol": 3, "slug": "fluffy-meow-meow-3", "title_ko": "몽실몽실 아기냥 3", "title_zh": "棉球小猫 第3弹(奶猫)", "series_id": "Kakao-Vol.3"},
    {"vol": 4, "slug": "fluffy-meow-meow-4", "title_ko": "몽실몽실 냥냥이 4", "title_zh": "棉球小猫 第4弹", "series_id": "Kakao-Vol.4"},
    {"vol": 5, "slug": "fluffy-meow-meow-5", "title_ko": "몽실몽실 냥냥이 5", "title_zh": "棉球小猫 第5弹", "series_id": "Kakao-Vol.5"},
    {"vol": 6, "slug": "fluffy-meow-meow-6", "title_ko": "몽실몽실 냥냥이 6", "title_zh": "棉球小猫 第6弹", "series_id": "Kakao-Vol.6"},
    {"vol": 7, "slug": "fluffy-meow-meow-7", "title_ko": "몽실몽실 아기냥 7", "title_zh": "棉球小猫 第7弹(奶猫)", "series_id": "Kakao-Vol.7"},
    {"vol": 8, "slug": "fluffy-meow-meow-8", "title_ko": "몽실몽실 냥냥이 8", "title_zh": "棉球小猫 第8弹", "series_id": "Kakao-Vol.8"},
    {"vol": 9, "slug": "fluffy-meow-meow-9", "title_ko": "몽실몽실 냥냥이 9", "title_zh": "棉球小猫 第9弹", "series_id": "Kakao-Vol.9"},
    {"vol": 10, "slug": "fluffy-meow-meow-10", "title_ko": "몽실몽실 냥냥이 10", "title_zh": "棉球小猫 第10弹", "series_id": "Kakao-Vol.10"},
    {"vol": 101, "slug": "mini-meow-meow", "title_ko": "미니미니 냥냥이", "title_zh": "迷你棉球小猫 第1弹", "series_id": "Kakao-Mini.1"},
    {"vol": 102, "slug": "mini-meow-meow-2", "title_ko": "미니미니 냥냥이 2", "title_zh": "迷你棉球小猫 第2弹", "series_id": "Kakao-Mini.2"},
    {"vol": 103, "slug": "mini-meow-meow-3", "title_ko": "미니미니 냥냥이 3", "title_zh": "迷你棉球小猫 第3弹", "series_id": "Kakao-Mini.3"},
    {"vol": 104, "slug": "mini-meow-meow-4", "title_ko": "미니미니 냥냥이 4", "title_zh": "迷你棉球小猫 第4弹", "series_id": "Kakao-Mini.4"},
    {"vol": 105, "slug": "mini-meow-meow-5", "title_ko": "미니미니 냥냥이 5", "title_zh": "迷你棉球小猫 第5弹", "series_id": "Kakao-Mini.5"},
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Referer": "https://e.kakao.com/",
}


def clean_cdn_url(url: str) -> str:
    """清理 CDN URL 中的前端 hash 切片参数 (如 #_R_...)"""
    if not url:
        return ""
    if "#" in url:
        url = url.split("#", 1)[0]
    return url.strip()


def fetch_pack_meta(client: httpx.Client, slug: str) -> Optional[Dict[str, Any]]:
    """从 Kakao 官方 API 获取表情包元数据"""
    url = f"https://e.kakao.com/api/items/{slug}"
    try:
        resp = client.get(url, headers=HEADERS, timeout=15.0)
        if resp.status_code == 200:
            return resp.json()
        logging.warning("获取 %s 失败，HTTP 状态码: %d", slug, resp.status_code)
        return None
    except Exception as e:
        logging.error("请求 %s 异常: %s", url, e)
        return None


def fetch_and_save_kakao_pack(
    client: httpx.Client,
    pack_info: Dict[str, Any],
    raw_dir: str = "images/raw",
    thumb_dir: str = "images/thumbs",
    limit: Optional[int] = None,
    dry_run: bool = False,
) -> List[Dict[str, Any]]:
    """下载并保存指定套系的所有表情"""
    slug = pack_info["slug"]
    series_id = pack_info["series_id"]
    vol = pack_info["vol"]
    title_zh = pack_info["title_zh"]

    logging.info("正在查询套系: %s (%s)...", title_zh, slug)
    meta = fetch_pack_meta(client, slug)
    if not meta or "contents" not in meta or "items" not in meta["contents"]:
        logging.error("无法解析套系 %s 的 items", slug)
        return []

    items = meta["contents"]["items"]
    title_ko = meta.get("title", pack_info["title_ko"])
    logging.info("成功获取套系 [%s (%s)]，包含 %d 张表情", title_zh, title_ko, len(items))

    if limit and limit > 0:
        items = items[:limit]
        logging.info("限制抓取前 %d 张表情", limit)

    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(thumb_dir, exist_ok=True)

    results = []

    for idx, item in enumerate(items, start=1):
        # 优先使用 animatedUrl (动图预览)，若无则使用 thumbnailUrl
        img_url = clean_cdn_url(item.get("animatedUrl") or item.get("thumbnailUrl") or "")
        if not img_url:
            continue

        item_id = f"kakao-{vol:02d}-{idx:02d}"
        if dry_run:
            results.append({
                "id": item_id,
                "title": f"{title_zh} #{idx:02d}",
                "title_ko": f"{title_ko} #{idx:02d}",
                "series": series_id,
                "source_url": img_url,
            })
            continue

        try:
            # 检查本地是否已有下载好的文件
            existing_file = None
            for check_ext in ("webp", "gif", "png"):
                check_path = os.path.join(raw_dir, f"{item_id}.{check_ext}")
                if os.path.exists(check_path) and os.path.getsize(check_path) > 0:
                    existing_file = check_path
                    break

            if existing_file:
                with open(existing_file, "rb") as ef:
                    data = ef.read()
            else:
                r = client.get(img_url, headers=HEADERS, timeout=20.0)
                if r.status_code != 200:
                    logging.warning("下载 %s 失败，HTTP %d", img_url, r.status_code)
                    continue
                data = r.content

            # 识别格式
            ext = detect_image_format(data) or "webp"
            sha256_hash = calculate_sha256(data)

            # 打开图片提取尺寸与 dHash
            with Image.open(io.BytesIO(data)) as pil_img:
                width, height = pil_img.size
                is_animated = getattr(pil_img, "is_animated", False)
                dhash_val = compute_dhash(pil_img)

            raw_filename = f"{item_id}.{ext}"
            raw_path = os.path.join(raw_dir, raw_filename)
            with open(raw_path, "wb") as f:
                f.write(data)

            # 生成 200px WebP 缩略图
            thumb_data, tw, th = generate_thumbnail(data, max_width=200)
            thumb_filename = f"{item_id}.webp"
            thumb_path = os.path.join(thumb_dir, thumb_filename)
            with open(thumb_path, "wb") as f:
                f.write(thumb_data)

            record = {
                "id": item_id,
                "title": f"{title_zh} #{idx:02d}",
                "title_ko": f"{title_ko} #{idx:02d}",
                "series": series_id,
                "author": "쯔니 (zzni)",
                "is_animated": is_animated,
                "format": ext,
                "width": width,
                "height": height,
                "sha256": sha256_hash,
                "dhash": dhash_val,
                "tags": ["可爱", "猫咪", "韩系", "官方原版", series_id],
                "ocr_text": "",
                "category": ["official", "animated" if is_animated else "static"],
                "raw_file": f"images/raw/{raw_filename}",
                "thumb_file": f"images/thumbs/{thumb_filename}",
                "source_url": img_url,
            }
            results.append(record)
            logging.info("已保存: %s (%dx%d, %s, %d KB)", raw_filename, width, height, ext, len(data) // 1024)
        except Exception as e:
            logging.error("处理 %s 出现异常: %s", img_url, e)

    return results


def main():
    parser = argparse.ArgumentParser(description="抓取 Kakao 官方「棉球小猫」表情包")
    parser.add_argument("--all", action="store_true", help="抓取所有已知系列")
    parser.add_argument("--slug", type=str, default="", help="指定抓取的系列 slug (如 fluffy-meow-meow-4)")
    parser.add_argument("--limit", type=int, default=None, help="每个系列抓取的表情数量上限（便于测试）")
    parser.add_argument("--dry-run", action="store_true", help="仅测试接口解析，不下载文件")
    args = parser.parse_args()

    targets = []
    if args.slug:
        matched = [item for item in KAKAO_SERIES_CATALOG if item["slug"] == args.slug]
        if matched:
            targets.extend(matched)
        else:
            targets.append({
                "vol": 99,
                "slug": args.slug,
                "title_ko": args.slug,
                "title_zh": args.slug,
                "series_id": f"Kakao-{args.slug}",
            })
    elif args.all:
        targets = KAKAO_SERIES_CATALOG
    else:
        # 默认抓取第 1 弹作为验证
        targets = [KAKAO_SERIES_CATALOG[0]]

    logging.info("计划抓取 %d 个系列...", len(targets))

    total_downloaded = []
    with httpx.Client(follow_redirects=True) as client:
        for pack in targets:
            items = fetch_and_save_kakao_pack(
                client,
                pack,
                limit=args.limit,
                dry_run=args.dry_run,
            )
            total_downloaded.extend(items)

    logging.info("抓取完成！共收集 %d 个表情项目。", len(total_downloaded))
    if total_downloaded:
        from scripts.build_index import build_index
        logging.info("正在更新全量静态索引与元数据...")
        build_index()


if __name__ == "__main__":
    main()
