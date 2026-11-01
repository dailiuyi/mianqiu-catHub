"""图像处理与感知哈希工具库 (image_utils.py)

提供：
1. 文件头魔数格式识别（纠正 QQ/社媒将 GIF 存为 JPG 的问题）
2. 200px 极速 WebP 缩略图生成（支持静态与动图，保留透明通道）
3. dHash 感知哈希计算与汉明距离去重
4. SHA256 精确去重
"""

import io
import hashlib
from typing import Optional, Tuple
from PIL import Image, ImageSequence


def detect_image_format(data: bytes) -> Optional[str]:
    """通过魔数检测图片真实格式"""
    if len(data) < 12:
        return None
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "gif"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    return None


def calculate_sha256(data: bytes) -> str:
    """计算文件 SHA-256 哈希值"""
    return hashlib.sha256(data).hexdigest()


def compute_dhash(img: Image.Image, hash_size: int = 8) -> str:
    """计算差异哈希 (dHash)。
    缩放为 (hash_size + 1, hash_size) 的灰度图，比较相邻像素差异。
    返回 16 位十六进制字符串（64位二进制）。
    """
    # 提取第一帧（若是动图）
    if hasattr(img, "is_animated") and img.is_animated:
        img.seek(0)
    
    # 转为灰度图
    gray = img.convert("L")
    # 缩放至 (9, 8)
    resized = gray.resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    if hasattr(resized, "get_flattened_data"):
        pixels = list(resized.get_flattened_data())
    else:
        pixels = list(resized.getdata())

    # 比较每行相邻两个像素
    diff = []
    width = hash_size + 1
    for row in range(hash_size):
        row_offset = row * width
        for col in range(hash_size):
            pixel_left = pixels[row_offset + col]
            pixel_right = pixels[row_offset + col + 1]
            diff.append(pixel_left > pixel_right)

    # 转化为十六进制
    decimal_val = 0
    for idx, bit in enumerate(diff):
        if bit:
            decimal_val |= 1 << (len(diff) - 1 - idx)
    return f"{decimal_val:016x}"


def hamming_distance(hash1: str, hash2: str) -> int:
    """计算两个十六进制 dHash 字符串的汉明距离（不同位数的数量）
    距离 <= 5 表示几乎同一张图；<= 10 表示高相似度（如微小裁剪或文字叠加）
    """
    try:
        val1 = int(hash1, 16)
        val2 = int(hash2, 16)
        xor_val = val1 ^ val2
        return bin(xor_val).count("1")
    except (ValueError, TypeError):
        return 64


def generate_thumbnail(image_data: bytes, max_width: int = 200, quality: int = 85) -> Tuple[bytes, int, int]:
    """生成 200px 宽度的 WebP 缩略图。
    返回 (webp_bytes, width, height)
    """
    with Image.open(io.BytesIO(image_data)) as img:
        # 如果是动图，取第 0 帧生成极速静态 WebP
        if hasattr(img, "is_animated") and img.is_animated:
            frame = next(ImageSequence.Iterator(img)).copy()
        else:
            frame = img.copy()

        # 处理透明通道
        if frame.mode in ("RGBA", "LA") or (frame.mode == "P" and "transparency" in frame.info):
            frame = frame.convert("RGBA")
        else:
            frame = frame.convert("RGB")

        orig_w, orig_h = frame.size
        if orig_w > max_width:
            target_w = max_width
            target_h = max(1, int(orig_h * (max_width / orig_w)))
            thumb = frame.resize((target_w, target_h), Image.Resampling.LANCZOS)
        else:
            target_w, target_h = orig_w, orig_h
            thumb = frame

        out_io = io.BytesIO()
        thumb.save(out_io, format="WEBP", quality=quality, method=4)
        return out_io.getvalue(), target_w, target_h
