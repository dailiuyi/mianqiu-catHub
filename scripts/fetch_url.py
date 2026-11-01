"""网络链接抓取与导入工具 (scripts/fetch_url.py)

支持：
1. 直接图片链接（GIF / WebP / PNG / JPG）
2. 小红书图文笔记无水印直链解析与图片提取
3. 自动识别文件头魔数，生成 200px 缩略图与 dHash 入库
"""

import os
import re
import sys
import argparse
import logging
from typing import Optional, List, Dict, Any
import httpx
from PIL import Image
import io

from scripts.image_utils import (
    detect_image_format,
    calculate_sha256,
    compute_dhash,
    generate_thumbnail,
)

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
}


def clean_xhs_image_url(url: str) -> str:
    """提取小红书无水印高清图直链"""
    # 如果包含 sns-webpic 且有水印参数，尝试替换为源站无水印直链
    if "xhscdn.com" in url or "xiaohongshu.com" in url:
        # 去掉常见的水印缩放参数
        cleaned = re.sub(r"\?imageView2/.*", "", url)
        cleaned = re.sub(r"!.*", "", cleaned)
        return cleaned
    return url


def fetch_and_import_url(
    client: httpx.Client,
    url: str,
    title: str = "",
    series: str = "web_import",
    tags: Optional[List[str]] = None,
    raw_dir: str = "images/raw",
    thumb_dir: str = "images/thumbs",
) -> Optional[Dict[str, Any]]:
    """从网络 URL 抓取并导入单张图片"""
    url = clean_xhs_image_url(url.strip())
    logging.info("正在抓取 URL: %s", url)

    headers = dict(DEFAULT_HEADERS)
    if "xhscdn" in url or "xiaohongshu" in url:
        headers["Referer"] = "https://www.xiaohongshu.com/"
    elif "hdslb" in url or "bilibili" in url:
        headers["Referer"] = "https://www.bilibili.com/"

    try:
        resp = client.get(url, headers=headers, timeout=20.0)
        if resp.status_code != 200:
            logging.warning("下载失败 HTTP %d: %s", resp.status_code, url)
            return None
        data = resp.content
    except Exception as e:
        logging.error("抓取网络图片失败 %s: %s", url, e)
        return None

    ext = detect_image_format(data)
    if not ext:
        logging.warning("无法识别文件格式: %s", url)
        return None

    sha256_val = calculate_sha256(data)
    short_hash = sha256_val[:8]

    try:
        with Image.open(io.BytesIO(data)) as pil_img:
            width, height = pil_img.size
            is_animated = getattr(pil_img, "is_animated", False)
            dhash_val = compute_dhash(pil_img)
    except Exception as e:
        logging.warning("解析图像数据异常 %s: %s", url, e)
        return None

    item_id = f"{series}-{short_hash}"
    raw_filename = f"{item_id}.{ext}"
    thumb_filename = f"{item_id}.webp"

    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(thumb_dir, exist_ok=True)

    raw_path = os.path.join(raw_dir, raw_filename)
    thumb_path = os.path.join(thumb_dir, thumb_filename)

    with open(raw_path, "wb") as f:
        f.write(data)

    thumb_data, tw, th = generate_thumbnail(data, max_width=200)
    with open(thumb_path, "wb") as f:
        f.write(thumb_data)

    tag_list = list(tags) if tags else ["网络导入", "猫咪"]
    if is_animated:
        tag_list.append("动图")
    else:
        tag_list.append("静图")

    record = {
        "id": item_id,
        "title": title or item_id,
        "title_ko": "",
        "series": series,
        "author": "网络收集",
        "is_animated": is_animated,
        "format": ext,
        "width": width,
        "height": height,
        "sha256": sha256_val,
        "dhash": dhash_val,
        "tags": list(dict.fromkeys(tag_list)),
        "ocr_text": "",
        "category": [series, "animated" if is_animated else "static"],
        "raw_file": f"images/raw/{raw_filename}",
        "thumb_file": f"images/thumbs/{thumb_filename}",
        "source_url": url,
    }
    logging.info("导入成功: %s -> %s (%s, %dx%d)", url, raw_filename, ext, width, height)
    return record


def main():
    parser = argparse.ArgumentParser(description="单张或批量图片 URL 抓取导入")
    parser.add_argument("url", type=str, help="图片 URL")
    parser.add_argument("--title", type=str, default="", help="表情标题")
    parser.add_argument("--series", type=str, default="web_import", help="归属套系")
    parser.add_argument("--tags", type=str, default="可爱,猫咪", help="标签列表，逗号分隔")
    args = parser.parse_args()

    tag_list = [t.strip() for t in args.tags.split(",") if t.strip()]
    with httpx.Client(follow_redirects=True) as client:
        rec = fetch_and_import_url(
            client,
            args.url,
            title=args.title,
            series=args.series,
            tags=tag_list,
        )
        if rec:
            from scripts.build_index import build_index
            logging.info("正在自动更新索引与缩略图...")
            build_index()

if __name__ == "__main__":
    main()
