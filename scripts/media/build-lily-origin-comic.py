#!/usr/bin/env python3
from __future__ import annotations

import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "docs/media/lily-origin-comic/raw"
OUT_DIR = ROOT / "docs/media/lily-origin-comic/pages"
FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"


PAGE_TEXT = {
	1: [
		("旁白", "夕阳西沉，余晖笼罩王都边缘的石板路。"),
		("莉莉", "又失败了……可魔法是神圣的，不能被随意摆弄。"),
		("旁白", "破旧魔法书被她抱得很紧，发梢仍沾着微光魔尘。"),
	],
	2: [
		("少年", "喂！瞧瞧那个怪胎！"),
		("少年", "明明天赋平平，还敢拒绝我的邀请？真是不识好歹！"),
		("莉莉", "放开我……求你了……"),
	],
	3: [
		("少年", "什么“魔法必须正确使用”，真是烦透了！"),
		("旁白", "无形的力道推得莉莉踉跄后退，书页在风中翻动。"),
		("莉莉", "可……这样做不对。魔法必须得到尊重。"),
	],
	4: [
		("巫妖", "哦呀？这是什么热闹的场面啊？"),
		("少年", "是巫妖！快跑啊！"),
		("巫妖", "啧，真是扫兴。现在的年轻人，连基本的礼貌都不懂。"),
	],
	5: [
		("巫妖", "小姑娘，你没事吧？被人欺负的感觉，可不好受吧？"),
		("莉莉", "我……我真的好累。我不想再被欺负了……"),
		("巫妖", "想试试这个吗？它能帮像你这样的“异类”守护自己。"),
	],
	6: [
		("巫妖", "当然，使用它是有代价的。你愿意听我说完吗？"),
		("莉莉", "命……命匣是什么？"),
		("巫妖", "你依然是人类。道路会偏离，但它依然属于你。"),
		("莉莉", "我愿意试试，请帮我变得更强。"),
	],
	7: [
		("巫妖", "闭上眼睛，放松身体。不要抗拒。"),
		("旁白", "冰凉的能量流入灵魂，骰子化作温暖的光。"),
		("巫妖", "欢迎来到我的精神领域。真正的技艺，在于理解因果网络。"),
		("莉莉", "我会记住的。"),
	],
	8: [
		("巫妖", "走进去，莉莉。你会找到属于你的道路。"),
		("旁白", "门后，紫罗兰花园的风带着花香与魔力低语。"),
		("莉莉", "那么……请见证我的第一枚骰子吧。"),
	],
}

PAGE_LAYOUT = {
	1: [(0.05, 0.06, 0.48, None), (0.46, 0.42, 0.49, (0.52, 0.38)), (0.05, 0.76, 0.56, None)],
	2: [(0.07, 0.08, 0.42, (0.56, 0.14)), (0.47, 0.36, 0.47, (0.50, 0.36)), (0.08, 0.73, 0.48, (0.42, 0.75))],
	3: [(0.08, 0.06, 0.50, (0.58, 0.13)), (0.44, 0.46, 0.50, None), (0.07, 0.78, 0.56, (0.45, 0.76))],
	4: [(0.08, 0.09, 0.50, (0.52, 0.09)), (0.47, 0.50, 0.45, (0.69, 0.54)), (0.08, 0.78, 0.58, (0.50, 0.76))],
	5: [(0.08, 0.08, 0.52, (0.28, 0.15)), (0.47, 0.44, 0.45, (0.67, 0.42)), (0.08, 0.78, 0.58, (0.24, 0.76))],
	6: [(0.07, 0.07, 0.58, (0.28, 0.14)), (0.53, 0.34, 0.39, (0.70, 0.38)), (0.07, 0.58, 0.56, (0.25, 0.58)), (0.44, 0.82, 0.49, (0.61, 0.80))],
	7: [(0.07, 0.06, 0.48, (0.28, 0.12)), (0.42, 0.30, 0.53, None), (0.07, 0.61, 0.54, (0.28, 0.61)), (0.50, 0.82, 0.42, (0.61, 0.82))],
	8: [(0.08, 0.07, 0.56, (0.28, 0.12)), (0.48, 0.44, 0.43, None), (0.08, 0.82, 0.62, (0.58, 0.78))],
}


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
	return ImageFont.truetype(path, size)


def wrap_cjk(text: str, width: int) -> list[str]:
	return textwrap.wrap(text, width=width, break_long_words=True, replace_whitespace=False)


def draw_caption_box(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, w: int) -> int:
	text_font = font(FONT_REGULAR, 25)
	wrap_width = max(9, int((w - 52) / 25))
	lines = wrap_cjk(text, wrap_width)
	h = 30 + 36 * len(lines)
	x, y = xy
	box = (x, y, x + w, y + h)
	draw.rectangle(box, fill=(244, 235, 211, 230), outline=(72, 50, 45, 220), width=3)
	ty = y + 15
	for line in lines:
		draw.text((x + 24, ty), line, font=text_font, fill=(48, 34, 31, 255))
		ty += 36
	return h


def draw_speech_bubble(
	draw: ImageDraw.ImageDraw,
	xy: tuple[int, int],
	text: str,
	w: int,
	target: tuple[int, int] | None,
) -> int:
	text_font = font(FONT_REGULAR, 25)
	wrap_width = max(8, int((w - 58) / 25))
	lines = wrap_cjk(text, wrap_width)
	h = 38 + 38 * len(lines)
	x, y = xy
	box = (x, y, x + w, y + h)
	fill = (255, 253, 247, 238)
	outline = (37, 28, 33, 235)

	def boundary_point(target_xy: tuple[int, int]) -> tuple[float, float]:
		cx = x + w / 2
		cy = y + h / 2
		dx = target_xy[0] - cx
		dy = target_xy[1] - cy
		if abs(dx) * h > abs(dy) * w:
			bx = x + w if dx > 0 else x
			by = cy + dy * ((w / 2) / max(abs(dx), 1))
		else:
			by = y + h if dy > 0 else y
			bx = cx + dx * ((h / 2) / max(abs(dy), 1))
		return bx, by

	def tapered_tail(base: tuple[float, float], tip: tuple[float, float]) -> list[tuple[int, int]]:
		vx = tip[0] - base[0]
		vy = tip[1] - base[1]
		length = max((vx * vx + vy * vy) ** 0.5, 1)
		px = -vy / length
		py = vx / length
		mid = (base[0] * 0.55 + tip[0] * 0.45, base[1] * 0.55 + tip[1] * 0.45)
		left: list[tuple[int, int]] = []
		right: list[tuple[int, int]] = []
		for step in range(9):
			t = step / 8
			cx = (1 - t) * (1 - t) * base[0] + 2 * (1 - t) * t * mid[0] + t * t * tip[0]
			cy = (1 - t) * (1 - t) * base[1] + 2 * (1 - t) * t * mid[1] + t * t * tip[1]
			width = 10 * (1 - t) + 1.5 * t
			left.append((round(cx + px * width), round(cy + py * width)))
			right.append((round(cx - px * width), round(cy - py * width)))
		return left + list(reversed(right))

	if target is not None:
		base = boundary_point(target)
		tail_points = tapered_tail(base, target)
		draw.polygon(tail_points, fill=fill)
		draw.line(tail_points + [tail_points[0]], fill=outline, width=3, joint="curve")
	draw.rounded_rectangle(box, radius=min(34, h // 2), fill=fill, outline=outline, width=3)

	ty = y + 20
	for line in lines:
		draw.text((x + 28, ty), line, font=text_font, fill=(44, 31, 50, 255))
		ty += 38
	return h


def draw_box(
	draw: ImageDraw.ImageDraw,
	xy: tuple[int, int],
	speaker: str,
	text: str,
	w: int,
	target: tuple[int, int] | None,
) -> int:
	if speaker == "旁白":
		return draw_caption_box(draw, xy, text, w)
	return draw_speech_bubble(draw, xy, text, w, target)


def annotate_page(page_no: int) -> None:
	src = RAW_DIR / f"page-{page_no:02d}-raw.png"
	img = Image.open(src).convert("RGBA")
	overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
	draw = ImageDraw.Draw(overlay)
	w, h = img.size

	items = PAGE_TEXT[page_no]
	layout = PAGE_LAYOUT[page_no]
	for (speaker, text), (x_frac, y_frac, w_frac, target_frac) in zip(items, layout):
		box_w = int(w * w_frac)
		x = int(w * x_frac)
		y = int(h * y_frac)
		target = None if target_frac is None else (int(w * target_frac[0]), int(h * target_frac[1]))
		draw_box(draw, (x, y), speaker, text, box_w, target)

	out = Image.alpha_composite(img, overlay).convert("RGB")
	OUT_DIR.mkdir(parents=True, exist_ok=True)
	out.save(OUT_DIR / f"page-{page_no:02d}.jpg", quality=92, optimize=True)


def main() -> None:
	for page_no in range(1, 9):
		annotate_page(page_no)
		print((OUT_DIR / f"page-{page_no:02d}.jpg").relative_to(ROOT))


if __name__ == "__main__":
	main()
