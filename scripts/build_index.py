"""静态索引构建与元数据生成器 (scripts/build_index.py)

功能：
1. 扫描 images/raw/ 与 images/thumbs/
2. 为缺失缩略图的文件自动补充生成 200px WebP 缩略图
3. 提取 dHash、宽高、动图属性，利用 pypinyin 自动生成拼音全拼与首字母索引
4. 输出：
   - data/memes.json: 全量表情元数据列表
   - data/series.json: 套系列表与各套系计数
   - data/tags.json: 标签字典与热度计数
"""

import os
import sys
import json
import logging
from typing import Dict, Any, List
from PIL import Image

try:
    from pypinyin import lazy_pinyin, Style
except ImportError:
    def lazy_pinyin(text, style=None):
        return [text]
    class Style:
        FIRST_LETTER = None

from scripts.image_utils import (
    detect_image_format,
    calculate_sha256,
    compute_dhash,
    generate_thumbnail,
)

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_DIR = os.path.join(BASE_DIR, "images", "raw")
THUMB_DIR = os.path.join(BASE_DIR, "images", "thumbs")


def get_pinyin_search_tokens(text: str) -> Dict[str, str]:
    """生成拼音全拼与首字母，便于客户端与服务端模糊搜索"""
    if not text:
        return {"pinyin": "", "pinyin_first": ""}
    pinyin_full = "".join(lazy_pinyin(text))
    pinyin_first = "".join(lazy_pinyin(text, style=Style.FIRST_LETTER))
    return {
        "pinyin": pinyin_full.lower(),
        "pinyin_first": pinyin_first.lower(),
    }


def build_index() -> Dict[str, Any]:
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(THUMB_DIR, exist_ok=True)

    memes_json_path = os.path.join(DATA_DIR, "memes.json")
    existing_map = {}
    if os.path.exists(memes_json_path):
        try:
            with open(memes_json_path, "r", encoding="utf-8") as f:
                old_data = json.load(f)
                for item in old_data.get("memes", []):
                    existing_map[item["id"]] = item
        except Exception as e:
            logging.warning("读取已有 memes.json 失败: %s", e)

    raw_files = [
        f for f in sorted(os.listdir(RAW_DIR))
        if os.path.isfile(os.path.join(RAW_DIR, f)) and not f.startswith(".")
    ]

    memes: List[Dict[str, Any]] = []
    series_counter: Dict[str, int] = {}
    tags_counter: Dict[str, int] = {}

    for idx, fname in enumerate(raw_files, start=1):
        raw_path = os.path.join(RAW_DIR, fname)
        base_name, ext = os.path.splitext(fname)
        ext_clean = ext.lstrip(".").lower()
        item_id = base_name

        # 检查或生成缩略图
        thumb_filename = f"{item_id}.webp"
        thumb_path = os.path.join(THUMB_DIR, thumb_filename)

        with open(raw_path, "rb") as rf:
            raw_data = rf.read()

        sha256_val = calculate_sha256(raw_data)

        if not os.path.exists(thumb_path) or os.path.getsize(thumb_path) == 0:
            thumb_data, tw, th = generate_thumbnail(raw_data, max_width=200)
            with open(thumb_path, "wb") as tf:
                tf.write(thumb_data)
            logging.info("自动生成缩略图: %s", thumb_filename)

        # 读取已有元数据或从文件名提取
        old_item = existing_map.get(item_id, {})

        try:
            with Image.open(raw_path) as pil_img:
                width, height = pil_img.size
                is_animated = getattr(pil_img, "is_animated", False)
                dhash_val = compute_dhash(pil_img)
        except Exception:
            width, height = (360, 360)
            is_animated = ext_clean in ("gif", "webp")
            dhash_val = old_item.get("dhash", "")

        title = old_item.get("title")
        title_ko = old_item.get("title_ko", "")
        series = old_item.get("series")
        tags = old_item.get("tags")
        ocr_text = old_item.get("ocr_text", "")
        author = old_item.get("author", "쯔니 (zzni)")

        # 智能根据文件名推断套系
        if not series or series == "community":
            if base_name.startswith("kakao-"):
                parts = base_name.split("-")
                if len(parts) >= 3 and parts[1].isdigit():
                    vol_num = int(parts[1])
                    idx_num = int(parts[2]) if parts[2].isdigit() else parts[2]
                    if vol_num > 100:
                        mini_idx = vol_num - 100
                        series = f"Kakao-Mini.{mini_idx}"
                        if not title or title == base_name:
                            title = f"迷你棉球小猫 第{mini_idx}弹 #{idx_num:02d}"
                            title_ko = f"미니미니 냥냥이 #{idx_num:02d}" if mini_idx == 1 else f"미니미니 냥냥이 {mini_idx} #{idx_num:02d}"
                    else:
                        series = f"Kakao-Vol.{vol_num}"
                        if not title or title == base_name:
                            title = f"棉球小猫 第{vol_num}弹 #{idx_num:02d}"
                            title_ko = f"몽실몽실 냥냥이 #{idx_num:02d}"
                    if not tags:
                        tags = ["可爱", "猫咪", "韩系", "官方原版", series]
            elif "community_caption" in base_name or "comm_caption" in base_name or base_name.startswith("caption-"):
                series = "community_caption"
                if not tags:
                    tags = ["可爱", "猫咪", "二创", "梗图", "community_caption"]
            elif "community_clean" in base_name or "comm_clean" in base_name or base_name.startswith("clean-"):
                series = "community_clean"
                if not tags:
                    tags = ["可爱", "猫咪", "社区高清", "无字", "community_clean"]
            else:
                series = "community"
        if not title:
            title = base_name
        if not tags:
            tags = ["可爱", "猫咪"]

        pinyin_tokens = get_pinyin_search_tokens(f"{title} {ocr_text}")

        meme_entry = {
            "id": item_id,
            "title": title,
            "title_ko": title_ko,
            "series": series,
            "author": author,
            "is_animated": is_animated,
            "format": ext_clean,
            "width": width,
            "height": height,
            "sha256": sha256_val,
            "dhash": dhash_val,
            "tags": tags,
            "ocr_text": ocr_text,
            "pinyin": pinyin_tokens["pinyin"],
            "pinyin_first": pinyin_tokens["pinyin_first"],
            "category": [series, "animated" if is_animated else "static"],
            "url": f"images/raw/{fname}",
            "thumb_url": f"images/thumbs/{thumb_filename}",
            "source_url": old_item.get("source_url", ""),
        }
        memes.append(meme_entry)

        # 统计套系与标签
        series_counter[series] = series_counter.get(series, 0) + 1
        for t in tags:
            tags_counter[t] = tags_counter.get(t, 0) + 1

    memes_result = {
        "version": "1.0.0",
        "author": "쯔니 (zzni)",
        "series_name": "몽실몽실 냥냥이 (棉球小猫)",
        "total": len(memes),
        "memes": memes,
    }

    with open(memes_json_path, "w", encoding="utf-8") as f:
        json.dump(memes_result, f, ensure_ascii=False, indent=2)

    # 生成 series.json
    series_list = [
        {"id": sid, "name": sid, "count": count}
        for sid, count in sorted(series_counter.items(), key=lambda x: -x[1])
    ]
    with open(os.path.join(DATA_DIR, "series.json"), "w", encoding="utf-8") as f:
        json.dump({"series": series_list}, f, ensure_ascii=False, indent=2)

    # 生成 tags.json
    tags_list = [
        {"name": tag, "count": count}
        for tag, count in sorted(tags_counter.items(), key=lambda x: -x[1])
    ]
    with open(os.path.join(DATA_DIR, "tags.json"), "w", encoding="utf-8") as f:
        json.dump({"tags": tags_list}, f, ensure_ascii=False, indent=2)

    logging.info("索引构建完毕！包含 %d 张表情，%d 个系列，%d 个标签", len(memes), len(series_list), len(tags_list))
    return memes_result


if __name__ == "__main__":
    build_index()
