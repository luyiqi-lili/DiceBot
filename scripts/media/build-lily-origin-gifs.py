#!/usr/bin/env python3
from __future__ import annotations

import math
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SCENE_DIR = ROOT / "docs/media/lily-origin-live2d/scenes"
OUT_DIR = ROOT / "docs/media/lily-origin-live2d/gifs"
FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

W, H = 640, 426
FRAMES_PER_GIF = 12
FRAME_DURATION_MS = 170


SCENES = [
	("01", "黄昏归途", "又失败了……可是，魔法不应该被随便使用。"),
	("02", "巷口拦截", "喂！瞧瞧那个怪胎！"),
	("03", "微弱请求", "请让开……我只是想回家。"),
	("04", "书页坠落", "认真？原则？你还真把自己当回事啊。"),
	("05", "魂火初现", "哦呀？这是什么热闹的场面啊？"),
	("06", "巫妖现身", "现在的年轻人，连基本的礼貌都不懂。"),
	("07", "归还魔法书", "小姑娘，你没事吧？"),
	("08", "温柔骷髅", "被人欺负的感觉，可不好受吧？"),
	("09", "骰子邀约", "想试试这个吗？它能帮你守护自己。"),
	("10", "符文映瞳", "当然，使用它是有代价的。"),
	("11", "灵魂契约", "你将成为我命匣的一部分。"),
	("12", "骰入掌心", "我愿意试试。请帮我变得更强。"),
	("13", "精神领域", "欢迎来到我的精神领域。"),
	("14", "骰娘秘术", "真正的技艺，在于理解因果网络。"),
	("15", "花园之门", "走进去，莉莉。你会找到属于你的道路。"),
	("16", "第一枚骰子", "那么……请见证我的第一枚骰子吧。"),
]


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
	return ImageFont.truetype(path, size)


def cover_resize(img: Image.Image, width: int, height: int, zoom: float, x_bias: float, y_bias: float) -> Image.Image:
	src_w, src_h = img.size
	scale = max(width / src_w, height / src_h) * zoom
	resized = img.resize((math.ceil(src_w * scale), math.ceil(src_h * scale)), Image.Resampling.LANCZOS)
	max_x = max(0, resized.width - width)
	max_y = max(0, resized.height - height)
	x = int(max_x * (0.5 + x_bias))
	y = int(max_y * (0.5 + y_bias))
	x = min(max(x, 0), max_x)
	y = min(max(y, 0), max_y)
	return resized.crop((x, y, x + width, y + height))


def rounded_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill, outline=None, width: int = 1) -> None:
	draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap_cjk(text: str, max_chars: int) -> list[str]:
	if len(text) <= max_chars:
		return [text]
	return textwrap.wrap(text, width=max_chars, break_long_words=True, replace_whitespace=False)


def draw_caption(base: Image.Image, title: str, line: str, progress: float) -> Image.Image:
	frame = base.convert("RGBA")
	overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
	draw = ImageDraw.Draw(overlay)

	box_margin = 26
	box_h = 118
	box = (box_margin, H - box_h - 20, W - box_margin, H - 20)
	rounded_rect(draw, box, 18, (18, 14, 30, 204), (182, 137, 255, 170), 2)
	draw.rectangle((box[0] + 18, box[1], box[0] + 156, box[1] + 32), fill=(90, 52, 148, 225))

	title_font = load_font(FONT_BOLD, 20)
	text_font = load_font(FONT_REGULAR, 25)
	small_font = load_font(FONT_REGULAR, 15)

	draw.text((box[0] + 28, box[1] + 3), title, font=title_font, fill=(255, 245, 255, 255))
	draw.text((box[2] - 76, box[1] + 7), "Live2D", font=small_font, fill=(218, 200, 255, 230))

	visible_len = max(1, int(len(line) * progress))
	visible = line[:visible_len]
	lines = wrap_cjk(visible, 20)[:2]
	y = box[1] + 47
	for wrapped in lines:
		draw.text((box[0] + 28, y), wrapped, font=text_font, fill=(255, 250, 255, 255))
		y += 34

	# Soft magic shimmer, subtle enough to read as Live2D preview rather than a full FX pass.
	for i in range(5):
		x = int(W * (0.12 + i * 0.18 + 0.02 * math.sin(progress * math.tau + i)))
		y = int(H * (0.18 + 0.09 * math.cos(progress * math.tau + i)))
		r = 2 + (i % 2)
		draw.ellipse((x - r, y - r, x + r, y + r), fill=(196, 148, 255, 120))

	return Image.alpha_composite(frame, overlay).convert("RGB")


def make_scene(scene: Image.Image, index: int, title: str, caption: str) -> list[Image.Image]:
	frames: list[Image.Image] = []
	for i in range(FRAMES_PER_GIF):
		t = i / (FRAMES_PER_GIF - 1)
		breath = math.sin(t * math.tau)
		zoom = 1.055 + 0.018 * t + 0.006 * breath
		x_bias = 0.035 * math.sin(t * math.tau + index * 0.4)
		y_bias = 0.025 * math.cos(t * math.tau + index * 0.3)
		crop = cover_resize(scene, W, H, zoom, x_bias, y_bias)

		if index in {5, 6, 9, 10, 11, 12, 13, 14, 15, 16}:
			glow = Image.new("RGB", crop.size, (42, 20, 86))
			crop = Image.blend(crop, glow, 0.05 + 0.03 * max(0, breath))
		if index in {1, 2, 3, 4}:
			warm = Image.new("RGB", crop.size, (98, 48, 20))
			crop = Image.blend(crop, warm, 0.035)

		crop = ImageEnhance.Contrast(crop).enhance(1.05)
		crop = ImageEnhance.Color(crop).enhance(1.06)
		progress = min(1.0, 0.18 + t * 1.15)
		frames.append(draw_caption(crop, f"{index:02d} {title}", caption, progress))
	return frames


def main() -> None:
	OUT_DIR.mkdir(parents=True, exist_ok=True)

	for idx, (slug, title, caption) in enumerate(SCENES, start=1):
		scene_path = SCENE_DIR / f"scene-{slug}.png"
		scene = Image.open(scene_path).convert("RGB").filter(ImageFilter.SHARPEN)
		frames = make_scene(scene, idx, title, caption)
		out = OUT_DIR / f"scene-{slug}.gif"
		frames[0].save(
			out,
			save_all=True,
			append_images=frames[1:],
			duration=FRAME_DURATION_MS,
			loop=0,
			optimize=True,
			disposal=2,
		)
		print(out.relative_to(ROOT))


if __name__ == "__main__":
	main()
