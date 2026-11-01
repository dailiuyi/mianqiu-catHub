"""测试图像工具库 (tests/test_image_utils.py)"""

import io
from PIL import Image
import pytest
from scripts.image_utils import (
    detect_image_format,
    calculate_sha256,
    compute_dhash,
    hamming_distance,
    generate_thumbnail,
)


def create_sample_png(width=100, height=100, color=(255, 100, 100)) -> bytes:
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def create_sample_gif() -> bytes:
    img1 = Image.new("RGB", (100, 100), color=(255, 0, 0))
    img2 = Image.new("RGB", (100, 100), color=(0, 255, 0))
    buf = io.BytesIO()
    img1.save(buf, format="GIF", save_all=True, append_images=[img2], duration=100, loop=0)
    return buf.getvalue()


def test_detect_image_format():
    png_data = create_sample_png()
    assert detect_image_format(png_data) == "png"

    gif_data = create_sample_gif()
    assert detect_image_format(gif_data) == "gif"

    assert detect_image_format(b"corrupted") is None


def test_sha256_calculation():
    data = b"test_mianqiu_cat"
    h = calculate_sha256(data)
    assert len(h) == 64
    assert isinstance(h, str)


def test_dhash_and_hamming():
    img1 = Image.new("RGB", (100, 100), color=(255, 255, 255))
    img2 = Image.new("RGB", (100, 100), color=(255, 255, 255))
    h1 = compute_dhash(img1)
    h2 = compute_dhash(img2)
    assert len(h1) == 16
    assert hamming_distance(h1, h2) == 0


def test_generate_thumbnail():
    png_data = create_sample_png(width=400, height=300)
    thumb_data, tw, th = generate_thumbnail(png_data, max_width=200)

    assert tw == 200
    assert th == 150
    assert detect_image_format(thumb_data) == "webp"
