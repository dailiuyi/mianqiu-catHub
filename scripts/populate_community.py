"""社区表情包收集与生成脚本 (scripts/populate_community.py)

功能：
1. 抓取 Kakao 官方合作系列「프렌즈팝콘 X 몽실몽실 냥냥이」高清无字图源，归档入 community_clean 套系。
2. 提取社区高清无字透明底特写/头像表情，丰富 community_clean 套系。
3. 基于官方高清动态表情，结合国内高频流传的梗图与社交流行语（早八、不想上班、收到、好耶、委屈、贴贴等），
   生成标准带黑边字体的 animated WebP 二创表情，精准打上 OCR 文本与检索标签，归档入 community_caption 套系。
4. 计算 sha256 与 dHash，并生成规范的 200px 缩略图。
"""

import os
import io
import json
import logging
from typing import List, Dict, Any
import httpx
from PIL import Image, ImageDraw, ImageFont, ImageSequence

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

FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Referer": "https://e.kakao.com/",
}


def populate_community_clean(client: httpx.Client) -> List[Dict[str, Any]]:
    """抓取 Kakao 官方合作套系并补充高清无字社区表情"""
    slug = "friendspopcorn-x-fluffy-meowmeow"
    url = f"https://e.kakao.com/api/items/{slug}"
    resp = client.get(url, headers=HEADERS, timeout=15.0)
    if resp.status_code != 200:
        logging.error("获取 %s 失败，状态码: %d", slug, resp.status_code)
        return []

    data = resp.json()
    items = data.get("contents", {}).get("items", [])
    title_ko = data.get("title") or data.get("hero", {}).get("title") or "프렌즈팝콘 X 몽실몽실 냥냥이"

    records = []
    for idx, item in enumerate(items, start=1):
        img_url = item.get("animatedUrl") or item.get("thumbnailUrl")
        if not img_url:
            continue
        if "#" in img_url:
            img_url = img_url.split("#", 1)[0]

        item_id = f"community_clean-{idx:02d}"
        raw_path = os.path.join(RAW_DIR, f"{item_id}.webp")
        thumb_path = os.path.join(THUMB_DIR, f"{item_id}.webp")

        img_data = None
        if os.path.exists(raw_path) and os.path.getsize(raw_path) > 0:
            with open(raw_path, "rb") as rf:
                img_data = rf.read()
        else:
            r = client.get(img_url, headers=HEADERS, timeout=15.0)
            if r.status_code == 200:
                img_data = r.content
                with open(raw_path, "wb") as f:
                    f.write(img_data)

        if not img_data:
            continue

        thumb_data, tw, th = generate_thumbnail(img_data, max_width=200)
        with open(thumb_path, "wb") as tf:
            tf.write(thumb_data)

        sha256_val = calculate_sha256(img_data)
        with Image.open(io.BytesIO(img_data)) as pil_img:
            width, height = pil_img.size
            is_animated = getattr(pil_img, "is_animated", False)
            dhash_val = compute_dhash(pil_img)

        record = {
            "id": item_id,
            "title": f"棉球小猫社区高清图 #{idx:02d}",
            "title_ko": f"{title_ko} #{idx:02d}",
            "series": "community_clean",
            "author": "쯔니 (zzni)",
            "is_animated": is_animated,
            "format": "webp",
            "width": width,
            "height": height,
            "sha256": sha256_val,
            "dhash": dhash_val,
            "tags": ["可爱", "猫咪", "社区高清", "无字", "官方合作", "community_clean"],
            "ocr_text": "",
            "category": ["community_clean", "animated" if is_animated else "static"],
            "url": f"images/raw/{item_id}.webp",
            "thumb_url": f"images/thumbs/{item_id}.webp",
            "source_url": img_url,
        }
        records.append(record)
        logging.info("community_clean 入库: %s (%dx%d)", item_id, width, height)

    # 补充 8 张社区精选透明底高清静图特写 (17 ~ 24)
    extra_sources = [
        ("kakao-01-01.webp", "棉球小猫高清透明特写 - 乖坐"),
        ("kakao-01-08.webp", "棉球小猫高清透明特写 - 揉脸"),
        ("kakao-02-01.webp", "棉球小猫高清透明特写 - 眨眼"),
        ("kakao-03-01.webp", "棉球小猫高清透明特写 - 奶猫探头"),
        ("kakao-04-01.webp", "棉球小猫高清透明特写 - 趴卧"),
        ("kakao-05-01.webp", "棉球小猫高清透明特写 - 抱爪"),
        ("kakao-06-01.webp", "棉球小猫高清透明特写 - 摇耳朵"),
        ("kakao-07-01.webp", "棉球小猫高清透明特写 - 伸懒腰"),
    ]

    for offset, (src_name, title_desc) in enumerate(extra_sources, start=17):
        src_path = os.path.join(RAW_DIR, src_name)
        if not os.path.exists(src_path):
            continue

        item_id = f"community_clean-{offset:02d}"
        raw_path = os.path.join(RAW_DIR, f"{item_id}.webp")
        thumb_path = os.path.join(THUMB_DIR, f"{item_id}.webp")

        with Image.open(src_path) as im:
            first_frame = im.convert("RGBA")
            buf = io.BytesIO()
            first_frame.save(buf, format="WEBP", quality=95)
            img_data = buf.getvalue()

        with open(raw_path, "wb") as f:
            f.write(img_data)

        thumb_data, tw, th = generate_thumbnail(img_data, max_width=200)
        with open(thumb_path, "wb") as tf:
            tf.write(thumb_data)

        sha256_val = calculate_sha256(img_data)
        dhash_val = compute_dhash(first_frame)

        record = {
            "id": item_id,
            "title": title_desc,
            "title_ko": "몽실몽실 냥냥이",
            "series": "community_clean",
            "author": "쯔니 (zzni)",
            "is_animated": False,
            "format": "webp",
            "width": first_frame.width,
            "height": first_frame.height,
            "sha256": sha256_val,
            "dhash": dhash_val,
            "tags": ["可爱", "猫咪", "社区高清", "无字", "透明特写", "静图", "community_clean"],
            "ocr_text": "",
            "category": ["community_clean", "static"],
            "url": f"images/raw/{item_id}.webp",
            "thumb_url": f"images/thumbs/{item_id}.webp",
            "source_url": "",
        }
        records.append(record)
        logging.info("community_clean 补充静图入库: %s (%s)", item_id, title_desc)

    return records


# 30 个国内高频流传的棉球小猫二创带字/梗图表情包规格定义
COMMUNITY_CAPTIONS = [
    {"caption": "早八", "source": "kakao-02-17.webp", "tags": ["早八", "打工人", "痛苦", "挣扎", "起床困难户"]},
    {"caption": "不想上班", "source": "kakao-04-19.webp", "tags": ["不想上班", "打工人", "摸鱼", "摆烂", "不想努力了"]},
    {"caption": "收到", "source": "kakao-01-01.webp", "tags": ["收到", "职场", "敬礼", "好的", "没问题"]},
    {"caption": "好耶", "source": "kakao-01-03.webp", "tags": ["好耶", "开心", "欢呼", "庆祝", "耶"]},
    {"caption": "委屈", "source": "kakao-03-08.webp", "tags": ["委屈", "难过", "可怜", "泪眼", "呜呜"]},
    {"caption": "暗中观察", "source": "kakao-01-19.webp", "tags": ["暗中观察", "偷看", "探头", "窥视", "暗中窥屏"]},
    {"caption": "摸摸头", "source": "kakao-01-15.webp", "tags": ["摸摸头", "安慰", "治愈", "拍拍", "摸摸"]},
    {"caption": "贴贴", "source": "kakao-01-06.webp", "tags": ["贴贴", "蹭蹭", "喜欢", "撒娇", "粘人"]},
    {"caption": "晚安", "source": "kakao-01-20.webp", "tags": ["晚安", "睡觉", "盖被被", "好梦", "安安"]},
    {"caption": "疑惑", "source": "kakao-01-13.webp", "tags": ["疑惑", "问号", "懵圈", "思考", "什么"]},
    {"caption": "吃瓜", "source": "kakao-01-11.webp", "tags": ["吃瓜", "看戏", "围观", "前排", "吃瓜群众"]},
    {"caption": "生气", "source": "kakao-01-09.webp", "tags": ["生气", "气鼓鼓", "哼", "炸毛", "超凶"]},
    {"caption": "发呆", "source": "kakao-01-14.webp", "tags": ["发呆", "放空", "灵魂出窍", "神游", "愣住"]},
    {"caption": "大哭", "source": "kakao-01-07.webp", "tags": ["大哭", "流泪", "暴风哭泣", "破防", "呜哇"]},
    {"caption": "点赞", "source": "kakao-01-05.webp", "tags": ["点赞", "大拇指", "棒", "给力", "强"]},
    {"caption": "干饭", "source": "kakao-01-12.webp", "tags": ["干饭", "炫饭", "开吃", "干饭人", "真香"]},
    {"caption": "拜拜", "source": "kakao-01-04.webp", "tags": ["拜拜", "再见", "挥手", "溜了", "886"]},
    {"caption": "躺平", "source": "kakao-01-16.webp", "tags": ["躺平", "摆烂", "累了", "歇菜", "不干了"]},
    {"caption": "救救我", "source": "kakao-01-10.webp", "tags": ["救救我", "救命", "救我", "抓狂", "救命啊"]},
    {"caption": "乖巧", "source": "kakao-01-02.webp", "tags": ["乖巧", "坐好", "端庄", "听话", "乖"]},
    {"caption": "盯", "source": "kakao-01-18.webp", "tags": ["盯", "注视", "凝视", "看着你", "默默注视"]},
    {"caption": "比心", "source": "kakao-01-08.webp", "tags": ["比心", "爱心", "爱你", "喜欢", "心心"]},
    {"caption": "震惊", "source": "kakao-01-21.webp", "tags": ["震惊", "惊呆", "吓到", "目瞪口呆", "什么鬼"]},
    {"caption": "无语", "source": "kakao-01-22.webp", "tags": ["无语", "擦汗", "尴尬", "绝了", "离谱"]},
    {"caption": "撒娇", "source": "kakao-01-23.webp", "tags": ["撒娇", "卖萌", "求求了", "软萌", "好不好嘛"]},
    {"caption": "困了", "source": "kakao-01-24.webp", "tags": ["困了", "犯困", "哈欠", "迷迷糊糊", "好困"]},
    {"caption": "心碎", "source": "kakao-02-14.webp", "tags": ["心碎", "心痛", "难受", "扎心", "心拔凉"]},
    {"caption": "打卡", "source": "kakao-02-02.webp", "tags": ["打卡", "签到", "冒泡", "来了", "打卡成功"]},
    {"caption": "加油", "source": "kakao-02-04.webp", "tags": ["加油", "奋斗", "冲鸭", "打气", "奥利给"]},
    {"caption": "下班", "source": "kakao-02-09.webp", "tags": ["下班", "冲啊", "飞奔", "快乐", "放假了"]},
    {"caption": "摸鱼", "source": "kakao-02-16.webp", "tags": ["摸鱼", "打工人", "偷懒", "划水", "轻松"]},
    {"caption": "我太难了", "source": "kakao-02-11.webp", "tags": ["我太难了", "头疼", "无奈", "崩溃", "叹气"]},
    {"caption": "加班", "source": "kakao-04-18.webp", "tags": ["加班", "打工人", "深夜", "熬夜", "苦涩"]},
    {"caption": "别催了", "source": "kakao-03-12.webp", "tags": ["别催了", "捂耳朵", "不听", "慢点", "急什么"]},
    {"caption": "尊嘟假嘟", "source": "kakao-02-07.webp", "tags": ["尊嘟假嘟", "真的假的", "惊讶", "瞪大眼睛", "呆住"]},
    {"caption": "我要闹了", "source": "kakao-03-15.webp", "tags": ["我要闹了", "打滚", "撒泼", "生气", "闹脾气"]},
    {"caption": "谢谢老板", "source": "kakao-01-17.webp", "tags": ["谢谢老板", "感谢", "鞠躬", "作揖", "多谢"]},
    {"caption": "自闭", "source": "kakao-02-20.webp", "tags": ["自闭", "画圈圈", "面壁", "角落", "勿扰"]},
    {"caption": "这就来", "source": "kakao-02-10.webp", "tags": ["这就来", "飞奔", "马上到", "在路上", "小跑"]},
    {"caption": "已读不回", "source": "kakao-04-12.webp", "tags": ["已读不回", "冷漠", "放下手机", "沉默", "已阅"]},
    {"caption": "吃饱了", "source": "kakao-02-13.webp", "tags": ["吃饱了", "摸肚子", "好撑", "满足", "干饭完毕"]},
    {"caption": "不想动", "source": "kakao-05-10.webp", "tags": ["不想动", "瘫倒", "猫饼", "懒惰", "歇着"]},
    {"caption": "狂暴按头", "source": "kakao-02-08.webp", "tags": ["狂暴按头", "揉头", "摸摸", "疯狂按头", "rua"]},
    {"caption": "赞赏", "source": "kakao-03-05.webp", "tags": ["赞赏", "鼓掌", "啪啪啪", "精彩", "厉害"]},
    {"caption": "启动", "source": "kakao-02-03.webp", "tags": ["启动", "出发", "墨镜", "酷", "冲冲冲"]},
    {"caption": "我没意见", "source": "kakao-03-02.webp", "tags": ["我没意见", "投降", "双手赞成", "随便", "都行"]},
    {"caption": "吃土", "source": "kakao-04-15.webp", "tags": ["吃土", "贫穷", "没钱", "空空如也", "钱包空了"]},
    {"caption": "emo了", "source": "kakao-05-08.webp", "tags": ["emo了", "伤感", "抑郁", "委屈", "下雨"]},
    {"caption": "这就睡觉", "source": "kakao-03-24.webp", "tags": ["这就睡觉", "晚安", "钻被窝", "睡眠", "呼呼"]},
    {"caption": "头秃", "source": "kakao-05-14.webp", "tags": ["头秃", "掉毛", "抓狂", "秃头", "发愁"]},
]


def render_captioned_webp(src_path: str, caption: str, font: ImageFont.FreeTypeFont) -> bytes:
    """在动图的每一帧上绘制清晰的带黑描边中文字幕，输出 animated WebP 二进制数据"""
    with Image.open(src_path) as im:
        frames = []
        durations = []
        for frame in ImageSequence.Iterator(im):
            f = frame.convert("RGBA")
            draw = ImageDraw.Draw(f)

            bbox = draw.textbbox((0, 0), caption, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            x = (f.width - tw) // 2
            y = f.height - th - 16

            # 经典白字黑粗描边，任何背景都清晰可见
            draw.text(
                (x, y),
                caption,
                font=font,
                fill=(255, 255, 255, 255),
                stroke_width=3,
                stroke_fill=(20, 20, 20, 255),
            )
            frames.append(f)
            durations.append(frame.info.get("duration", 100))

        buf = io.BytesIO()
        frames[0].save(
            buf,
            format="WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=0,
            quality=90,
        )
        return buf.getvalue()


def populate_community_caption() -> List[Dict[str, Any]]:
    """生成并导入国内高频流传的棉球小猫二创带字/梗图表情包"""
    font = ImageFont.truetype(FONT_PATH, 28)
    records = []

    for idx, item in enumerate(COMMUNITY_CAPTIONS, start=1):
        caption = item["caption"]
        src_name = item["source"]
        src_path = os.path.join(RAW_DIR, src_name)
        if not os.path.exists(src_path):
            logging.warning("源图 %s 不存在，跳过", src_name)
            continue

        item_id = f"community_caption-{idx:02d}"
        raw_path = os.path.join(RAW_DIR, f"{item_id}.webp")
        thumb_path = os.path.join(THUMB_DIR, f"{item_id}.webp")

        data = render_captioned_webp(src_path, caption, font)
        with open(raw_path, "wb") as f:
            f.write(data)

        thumb_data, tw, th = generate_thumbnail(data, max_width=200)
        with open(thumb_path, "wb") as tf:
            tf.write(thumb_data)

        sha256_val = calculate_sha256(data)
        with Image.open(io.BytesIO(data)) as pil_img:
            width, height = pil_img.size
            is_animated = getattr(pil_img, "is_animated", False)
            dhash_val = compute_dhash(pil_img)

        all_tags = ["可爱", "猫咪", "二创", "梗图", "community_caption"] + item["tags"]
        all_tags = list(dict.fromkeys(all_tags))

        record = {
            "id": item_id,
            "title": f"棉球小猫二创梗图 - {caption}",
            "title_ko": "몽실몽실 냥냥이",
            "series": "community_caption",
            "author": "쯔니 (zzni)",
            "is_animated": is_animated,
            "format": "webp",
            "width": width,
            "height": height,
            "sha256": sha256_val,
            "dhash": dhash_val,
            "tags": all_tags,
            "ocr_text": caption,
            "category": ["community_caption", "animated" if is_animated else "static"],
            "url": f"images/raw/{item_id}.webp",
            "thumb_url": f"images/thumbs/{item_id}.webp",
            "source_url": "",
        }
        records.append(record)
        logging.info("community_caption 入库: %s (%s, %dx%d)", item_id, caption, width, height)

    return records


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(THUMB_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)

    logging.info("开始导入 community_clean 社区高清图源...")
    with httpx.Client(headers=HEADERS, follow_redirects=True) as client:
        clean_records = populate_community_clean(client)
    logging.info("community_clean 收集完成，共 %d 张表情", len(clean_records))

    logging.info("开始生成 community_caption 社区二创梗图表情...")
    caption_records = populate_community_caption()
    logging.info("community_caption 生成完成，共 %d 张表情", len(caption_records))

    # 合并进入 memes.json
    memes_json_path = os.path.join(DATA_DIR, "memes.json")
    existing_memes = []
    if os.path.exists(memes_json_path):
        try:
            with open(memes_json_path, "r", encoding="utf-8") as f:
                existing_memes = json.load(f).get("memes", [])
        except Exception as e:
            logging.warning("读取已有 memes.json 失败: %s", e)

    existing_map = {m["id"]: m for m in existing_memes}
    for r in clean_records + caption_records:
        existing_map[r["id"]] = r

    with open(memes_json_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "version": "1.0.0",
                "author": "쯔니 (zzni)",
                "series_name": "몽실몽실 냥냥이 (棉球小猫)",
                "total": len(existing_map),
                "memes": list(existing_map.values()),
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    from scripts.build_index import build_index
    logging.info("正在执行全量静态索引与元数据构建...")
    build_index()
    logging.info("全流程完成！当前表情库总数: %d", len(existing_map))


if __name__ == "__main__":
    main()
