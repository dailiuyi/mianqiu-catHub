"""动图 GIF 导出器 (scripts/export_gif.py)

把 images/raw/ 里的动图（主要是 Animated WebP）转成通用兼容的 GIF，写到 images/gif/{id}.gif。

为什么需要：Kakao 官方 CDN 和社区图源给的都是 Animated WebP，QQ、微信等客户端的表情上传对
WebP 支持不稳定，GIF 才是通用格式。转换放在构建阶段做，站点只负责静态分发，不在请求时耗 CPU。

要点：
1. 帧时长从 WebP 容器的 ANMF 块里读真实值（Pillow 在解码前读不到逐帧 duration）。
2. GIF 的帧延迟只能按 10ms（1/100 秒）存，逐帧四舍五入会累积成几百毫秒的漂移，
   所以按累计时间补偿取整；单帧最短 20ms（低于 20ms 时浏览器会当成 100ms）。
3. 保留透明背景：先把画面合成到品红再量化，用调色板保留索引 255 作为透明色。
4. 已经存在的 GIF 默认跳过，加 --force 重建。

用法：
    python -m scripts.export_gif            # 只补缺失的
    python -m scripts.export_gif --force    # 全部重建
    python -m scripts.export_gif --ids kakao-01-01,community_clean-03
"""

import argparse
import io
import json
import logging
import os
import struct
import sys
from typing import List, Optional

from PIL import Image, ImageSequence

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
GIF_DIR = os.path.join(BASE_DIR, "images", "gif")

TRANSPARENT_INDEX = 255
MIN_FRAME_MS = 20

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")


def webp_frame_durations(path: str) -> Optional[List[int]]:
    """读取 Animated WebP 每帧的显示时长（毫秒）。非动图返回 None。"""
    data = open(path, "rb").read()
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    durations = []
    pos = 12
    while pos + 8 <= len(data):
        tag = data[pos:pos + 4]
        size = struct.unpack("<I", data[pos + 4:pos + 8])[0]
        if tag == b"ANMF":
            payload = data[pos + 8:pos + 8 + size]
            durations.append(payload[12] | (payload[13] << 8) | (payload[14] << 16))
        pos += 8 + size + (size & 1)
    return durations or None


def gif_delays_ms(durations: List[int]) -> List[int]:
    """把真实帧时长映射成 GIF 的 10ms 单位延迟，按累计时间补偿取整误差。"""
    delays = []
    emitted = 0
    elapsed = 0
    for duration in durations:
        elapsed += duration
        target = round(elapsed / 10) * 10
        delay = max(MIN_FRAME_MS, target - emitted)
        delays.append(delay)
        emitted += delay
    return delays


def to_palette_frame(frame: Image.Image) -> Image.Image:
    """RGBA 帧转 8 位调色板，索引 255 留作透明色。"""
    rgba = frame.convert("RGBA")
    alpha = rgba.getchannel("A")
    solid = Image.new("RGB", rgba.size, (255, 0, 255))
    solid.paste(rgba, (0, 0), rgba)
    palette = solid.quantize(colors=TRANSPARENT_INDEX, method=Image.Quantize.FASTOCTREE,
                             dither=Image.Dither.NONE)
    palette.paste(TRANSPARENT_INDEX, mask=alpha.point(lambda a: 255 if a < 128 else 0))
    return palette


def convert(src_path: str, dst_path: str) -> int:
    durations = webp_frame_durations(src_path)
    with Image.open(src_path) as src:
        if getattr(src, "is_animated", False):
            frames = [to_palette_frame(frame) for frame in ImageSequence.Iterator(src)]
        else:
            frames = [to_palette_frame(src)]

    if not durations or len(durations) != len(frames):
        durations = [100] * len(frames)

    buffer = io.BytesIO()
    frames[0].save(
        buffer, format="GIF", save_all=True, append_images=frames[1:],
        duration=gif_delays_ms(durations), loop=0, optimize=True,
        transparency=TRANSPARENT_INDEX, disposal=2,
    )
    payload = buffer.getvalue()
    with open(dst_path, "wb") as out:
        out.write(payload)
    return len(payload)


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="把表情库动图导出为 GIF")
    parser.add_argument("--force", action="store_true", help="已存在的 GIF 也重建")
    parser.add_argument("--ids", default="", help="只处理这些 id，逗号分隔")
    args = parser.parse_args(argv)

    with open(os.path.join(DATA_DIR, "memes.json"), encoding="utf-8") as handle:
        memes = json.load(handle)["memes"]

    wanted = {item.strip() for item in args.ids.split(",") if item.strip()}
    os.makedirs(GIF_DIR, exist_ok=True)

    built = skipped = 0
    total_bytes = 0
    for meme in memes:
        if wanted and meme["id"] not in wanted:
            continue
        dst = os.path.join(GIF_DIR, f"{meme['id']}.gif")
        if os.path.exists(dst) and os.path.getsize(dst) > 0 and not args.force:
            skipped += 1
            continue
        total_bytes += convert(os.path.join(BASE_DIR, meme["url"]), dst)
        built += 1

    logging.info("GIF 导出完成：新建 %d 个，跳过 %d 个，新建体积 %.1f MB",
                 built, skipped, total_bytes / 1048576)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
