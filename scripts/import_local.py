"""本地与 QQ 表情缓存清洗与批量导入脚本 (scripts/import_local.py)

功能：
1. 递归扫描本地目录或 ZIP 压缩包
2. 读取文件头魔数纠正真实文件格式（彻底解决 QQ 将 GIF 存为 .jpg 的问题）
3. 计算 SHA256 查重，计算 dHash 感知哈希提示高度相似图
4. 规范化存入 images/raw/ 并生成 200px images/thumbs/
"""

import os
import sys
import zipfile
import argparse
import logging
from typing import List, Dict, Any, Optional
from PIL import Image
import io

from scripts.image_utils import (
    detect_image_format,
    calculate_sha256,
    compute_dhash,
    hamming_distance,
    generate_thumbnail,
)

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")


def process_image_bytes(
    data: bytes,
    original_name: str,
    raw_dir: str = "images/raw",
    thumb_dir: str = "images/thumbs",
    series: str = "community",
    tags: Optional[List[str]] = None,
    existing_hashes: Optional[set] = None,
) -> Optional[Dict[str, Any]]:
    """清洗单张图片数据并入库"""
    if len(data) < 16:
        return None

    # 魔数识别真实格式
    detected_format = detect_image_format(data)
    if not detected_format:
        return None

    sha256_val = calculate_sha256(data)
    if existing_hashes and sha256_val in existing_hashes:
        logging.info("跳过完全重复的图片 (SHA256 命中): %s", original_name)
        return None

    # 打开图片解析元数据
    try:
        with Image.open(io.BytesIO(data)) as pil_img:
            width, height = pil_img.size
            is_animated = getattr(pil_img, "is_animated", False)
            dhash_val = compute_dhash(pil_img)
    except Exception as e:
        logging.warning("PIL 无法打开图片 %s: %s", original_name, e)
        return None

    # 规范化文件名称
    safe_name = os.path.splitext(os.path.basename(original_name))[0].replace(" ", "_")
    short_hash = sha256_val[:8]
    item_id = f"{series}-{safe_name}-{short_hash}" if safe_name else f"{series}-{short_hash}"
    raw_filename = f"{item_id}.{detected_format}"
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

    if existing_hashes is not None:
        existing_hashes.add(sha256_val)

    tag_list = list(tags) if tags else ["可爱", "猫咪"]
    if is_animated:
        tag_list.append("动图")
    else:
        tag_list.append("静图")

    record = {
        "id": item_id,
        "title": safe_name or item_id,
        "title_ko": "",
        "series": series,
        "author": "쯔니 (zzni) / 二创整理",
        "is_animated": is_animated,
        "format": detected_format,
        "width": width,
        "height": height,
        "sha256": sha256_val,
        "dhash": dhash_val,
        "tags": list(dict.fromkeys(tag_list)),
        "ocr_text": "",
        "category": [series, "animated" if is_animated else "static"],
        "raw_file": f"images/raw/{raw_filename}",
        "thumb_file": f"images/thumbs/{thumb_filename}",
        "source_url": "",
    }
    logging.info("入库成功: %s -> %s (%s, %dx%d)", original_name, raw_filename, detected_format, width, height)
    return record


def import_from_directory(
    dir_path: str,
    series: str = "community",
    tags: Optional[List[str]] = None,
    raw_dir: str = "images/raw",
    thumb_dir: str = "images/thumbs",
) -> List[Dict[str, Any]]:
    """从本地文件夹导入所有表情（支持递归扫描）"""
    if not os.path.exists(dir_path):
        logging.error("指定的目录不存在: %s", dir_path)
        return []

    existing_hashes = set()
    # 预加载已有 raw 图片的 sha256
    if os.path.exists(raw_dir):
        for f in os.listdir(raw_dir):
            fp = os.path.join(raw_dir, f)
            if os.path.isfile(fp):
                try:
                    with open(fp, "rb") as rf:
                        existing_hashes.add(calculate_sha256(rf.read()))
                except Exception:
                    pass

    imported = []
    for root, _, files in os.walk(dir_path):
        for fname in sorted(files):
            file_path = os.path.join(root, fname)
            try:
                with open(file_path, "rb") as f:
                    content = f.read()
                rec = process_image_bytes(
                    content,
                    fname,
                    raw_dir=raw_dir,
                    thumb_dir=thumb_dir,
                    series=series,
                    tags=tags,
                    existing_hashes=existing_hashes,
                )
                if rec:
                    imported.append(rec)
            except Exception as e:
                logging.error("读取 %s 出错: %s", file_path, e)

    logging.info("目录扫描完成，本次共导入 %d 张表情", len(imported))
    return imported


def import_from_zip(
    zip_path: str,
    series: str = "community",
    tags: Optional[List[str]] = None,
    raw_dir: str = "images/raw",
    thumb_dir: str = "images/thumbs",
) -> List[Dict[str, Any]]:
    """从 ZIP 压缩包导入表情"""
    if not os.path.exists(zip_path):
        logging.error("指定的 ZIP 文件不存在: %s", zip_path)
        return []

    imported = []
    with zipfile.ZipFile(zip_path, "r") as z:
        for zinfo in z.infolist():
            if zinfo.is_dir():
                continue
            fname = os.path.basename(zinfo.filename)
            if not fname:
                continue
            with z.open(zinfo) as zf:
                data = zf.read()
            rec = process_image_bytes(
                data,
                fname,
                raw_dir=raw_dir,
                thumb_dir=thumb_dir,
                series=series,
                tags=tags,
            )
            if rec:
                imported.append(rec)
    return imported


def main():
    parser = argparse.ArgumentParser(description="本地文件或 QQ 收藏表情缓存导入工具")
    parser.add_argument("path", type=str, help="本地目录路径或 ZIP 压缩包路径")
    parser.add_argument("--series", type=str, default="community", help="表情归属套系名 (默认 community)")
    parser.add_argument("--tags", type=str, default="可爱,猫咪", help="初始标签，逗号分隔")
    args = parser.parse_args()

    tag_list = [t.strip() for t in args.tags.split(",") if t.strip()]
    if os.path.isfile(args.path) and args.path.lower().endswith(".zip"):
        res = import_from_zip(args.path, series=args.series, tags=tag_list)
    else:
        res = import_from_directory(args.path, series=args.series, tags=tag_list)
    if res:
        from scripts.build_index import build_index
        logging.info("正在自动更新索引与缩略图...")
        build_index()


if __name__ == "__main__":
    main()
