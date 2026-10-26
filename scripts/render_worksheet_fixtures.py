"""Render finished-worksheet fixture photos from data/sheets.json.

AI image generators garble exact text, so these fixtures are rendered with
Pillow instead: every printed question is copied verbatim from the sheet's
answer key in data/sheets.json, and the "kid handwriting" in the answer boxes
comes from a handwriting font (Marker Felt on macOS).

Usage (from the project root):
    source .venv/bin/activate
    python scripts/render_worksheet_fixtures.py

Output: generated_images/grade4-math-oct2026-{correct,mistakes}.jpg
"""

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHEETS_JSON = ROOT / "data" / "sheets.json"
OUT_DIR = ROOT / "generated_images"
SHEET_ID = "grade4-math-oct2026"

HELVETICA = "/System/Library/Fonts/Helvetica.ttc"
MARKER = "/System/Library/Fonts/MarkerFelt.ttc"

# Printable operator glyphs (safe in Helvetica).
OPERATORS = {"+": "+", "-": "\u2212", "x": "\u00d7", "/": "\u00f7"}


def printable_prompt(raw: str) -> str:
    """Format a stored prompt for print, e.g. '96 / 4' -> '96 ÷ 4'."""
    parts = raw.split(" ")
    if len(parts) == 3 and parts[1] in OPERATORS:
        return f"{parts[0]} {OPERATORS[parts[1]]} {parts[2]}"
    return raw


def load_sheet():
    sheets = json.loads(SHEETS_JSON.read_text())
    for s in sheets:
        if s["id"] == SHEET_ID:
            return s
    raise SystemExit(f"sheet {SHEET_ID!r} not found in {SHEETS_JSON}")


def draw_paper(sheet, answers: dict[str, str], scribble_qids: set[str]) -> Image.Image:
    W, H = 1040, 1460
    paper = Image.new("RGB", (W, H), "#fffdf8")
    d = ImageDraw.Draw(paper)

    f_title = ImageFont.truetype(HELVETICA, 46, index=0)
    f_small = ImageFont.truetype(HELVETICA, 20, index=0)
    f_q = ImageFont.truetype(HELVETICA, 34, index=0)
    f_word = ImageFont.truetype(HELVETICA, 24, index=0)
    f_hand = ImageFont.truetype(MARKER, 44, index=0)
    f_hand_sm = ImageFont.truetype(MARKER, 34, index=0)

    def center(y: int, text: str, font, fill="black"):
        w = d.textlength(text, font=font)
        d.text(((W - w) / 2, y), text, font=font, fill=fill)

    def bold(x: int, y: int, text: str, font, fill="black"):
        d.text((x, y), text, font=font, fill=fill)
        d.text((x + 1, y), text, font=font, fill=fill)

    # Header
    center(54, "Grade 4 \u2014 Math Practice Worksheet", f_title, fill="#1e3a8a")
    center(120, "Addition, Subtraction, Multiplication & Division", f_small)
    center(148, "Name:  Maya        Date: 10/26/2026", f_small)
    center(196, "Directions: Solve each problem. Write your answer in the box.", f_small)

    # Two-column grid, matching the original fixture's reading order:
    # left column q1..q4, right column q5..q8.
    key = sheet["answerKey"]
    assert len(key) == 8, f"expected 8 questions, got {len(key)}"
    cols = [key[:4], key[4:]]
    col_x = [70, 560]
    top, row_h = 300, 250

    for ci, col in enumerate(cols):
        for ri, item in enumerate(col):
            n = ci * 4 + ri + 1
            x, y = col_x[ci], top + ri * row_h
            prompt = printable_prompt(item["prompt"])
            is_word = len(prompt) > 14
            font = f_word if is_word else f_q
            bold(x, y, f"{n}.", font)
            num_w = d.textlength(f"{n}. ", font=font)
            if is_word:
                # Word problem: wrap to two lines, box on its own line.
                words, lines, cur = prompt.split(" "), [], ""
                for w_ in words:
                    trial = f"{cur} {w_}".strip()
                    if d.textlength(trial, font=font) > 400:
                        lines.append(cur)
                        cur = w_
                    else:
                        cur = trial
                lines.append(cur)
                yy = y
                for line in lines:
                    bold(x + num_w, yy, line, font)
                    yy += 34
                box_x, box_y = x + num_w, yy + 8
                box_w, box_h, hand = 150, 76, f_hand_sm
            else:
                text = f"{prompt} ="
                bold(x + num_w, y + 6, text, font)
                box_x = x + num_w + d.textlength(text + " ", font=font)
                box_y, box_w, box_h, hand = y, 140, 84, f_hand

            d.rectangle([box_x, box_y, box_x + box_w, box_y + box_h],
                        outline="black", width=3, fill="white")
            ans = answers[item["qid"]]
            aw = d.textlength(ans, font=hand)
            d.text((box_x + (box_w - aw) / 2, box_y + 8), ans,
                   font=hand, fill="#333333")
            if item["qid"] in scribble_qids:
                rng = random.Random(7)
                for _ in range(7):
                    pts = [(box_x + rng.uniform(-6, box_w + 6),
                            box_y + rng.uniform(-6, box_h + 6)) for _ in range(6)]
                    d.line(pts, fill="#1a1a1a", width=4, joint="curve")

    center(H - 70, "Check your work! \u2022 Show your thinking if you can.", f_small)
    return paper


def photograph(paper: Image.Image, angle: float, bg: tuple[int, int, int]) -> Image.Image:
    """Mount the paper on a desk backdrop with a slight tilt for a photo feel."""
    W, H = 1200, 1620
    desk = Image.new("RGB", (W, H), bg)
    rng = random.Random(3)
    px = desk.load()
    for i in range(0, W, 3):
        for j in range(0, H, 3):
            v = rng.randint(-8, 8)
            r, g, b = bg
            px[i, j] = (r + v, g + v, b + v)
    tilted = paper.rotate(angle, expand=True, resample=Image.BICUBIC, fillcolor="#fffdf8")
    desk.paste(tilted, ((W - tilted.width) // 2, (H - tilted.height) // 2))
    return desk


def main() -> None:
    sheet = load_sheet()
    key = {i["qid"]: i["answer"] for i in sheet["answerKey"]}
    print(f"Loaded sheet {sheet['id']!r}: {len(key)} questions.")

    variants = {
        "correct": (dict(key), set()),
        # Realistic grading test: one wrong answer, one scribbled-out (unsure).
        "mistakes": ({**key, "q3": "54"}, {"q5"}),
    }
    OUT_DIR.mkdir(exist_ok=True)
    for name, (answers, scribbles) in variants.items():
        paper = draw_paper(sheet, answers, scribbles)
        photo = photograph(paper, -0.7 if name == "correct" else 0.6,
                           (138, 106, 69) if name == "correct" else (87, 104, 127))
        out = OUT_DIR / f"{SHEET_ID}-{name}.jpg"
        photo.save(out, quality=88)
        print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")

    # Echo the contract so a human can eyeball the print against the key.
    for i in sheet["answerKey"]:
        print(f"  {i['qid']}: {printable_prompt(i['prompt'])}  ->  {i['answer']}")


if __name__ == "__main__":
    main()
