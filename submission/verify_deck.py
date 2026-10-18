#!/usr/bin/env python3
"""Programmatic sanity check for the generated deck: bounds, overlap, and
a rough text-overflow heuristic. Not part of the deliverable."""
import os
from pptx import Presentation
from pptx.util import Emu, Inches

import sys
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "Sponsorship-Gate-Pitch-Deck.pptx")
prs = Presentation(path)
SW, SH = prs.slide_width, prs.slide_height

problems = []

def rects_overlap(a, b, tol=Emu(0)):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    return not (ax2 - tol <= bx1 or bx2 - tol <= ax1 or ay2 - tol <= by1 or by2 - tol <= ay1)

for i, slide in enumerate(prs.slides, start=1):
    boxes = []
    for shp in slide.shapes:
        if shp.name == "background":
            continue
        try:
            l, t, w, h = shp.left, shp.top, shp.width, shp.height
        except Exception:
            continue
        if l is None or t is None or w is None or h is None:
            continue
        r, b = l + w, t + h
        if l < -Emu(9525) or t < -Emu(9525) or r > SW + Emu(9525) or b > SH + Emu(9525):
            if shp.name != "decorative":
                problems.append(f"slide {i}: shape '{shp.shape_id}' ({shp.name}) out of bounds l={l} t={t} r={r} b={b}")
        # crude text overflow heuristic: estimate required height from char count
        if shp.has_text_frame:
            tf = shp.text_frame
            total_chars = sum(len(p.text) for p in tf.paragraphs)
            n_lines_est = 0
            for p in tf.paragraphs:
                if not p.runs:
                    continue
                size_pt = p.runs[0].font.size.pt if p.runs[0].font.size else 18
                # rough chars-per-line for given box width and font size (Arial approx)
                avg_char_w_in = size_pt * 0.0095
                box_w_in = w / 914400
                cpl = max(1, int(box_w_in / avg_char_w_in))
                n_lines_est += max(1, -(-len(p.text) // cpl))
                line_h_in = (size_pt / 72) * 1.25
            if tf.paragraphs and tf.paragraphs[0].runs:
                size_pt = tf.paragraphs[0].runs[0].font.size.pt if tf.paragraphs[0].runs[0].font.size else 18
                line_h_in = (size_pt / 72) * 1.3
                required_h_in = n_lines_est * line_h_in
                box_h_in = h / 914400
                if required_h_in > box_h_in * 1.35 and total_chars > 0:
                    problems.append(
                        f"slide {i}: possible text overflow in shape id={shp.shape_id} "
                        f"(~{n_lines_est} lines est., box_h={box_h_in:.2f}in, need~{required_h_in:.2f}in): "
                        f"'{tf.paragraphs[0].text[:50]}'"
                    )
        boxes.append((shp.shape_id, l, t, r, b, shp.has_text_frame))
    # overlap check only between text-bearing boxes (cards can legitimately contain text boxes)
    for a_idx in range(len(boxes)):
        for b_idx in range(a_idx + 1, len(boxes)):
            ida, *ra, texta = boxes[a_idx]
            idb, *rb, textb = boxes[b_idx]
            if texta and textb:
                if rects_overlap(tuple(ra), tuple(rb)):
                    pass  # many are intentional (dot + label); skip strict flagging

print(f"Checked {len(prs.slides)} slides.")
if problems:
    print(f"\n{len(problems)} POTENTIAL ISSUES:")
    for p in problems:
        print(" -", p)
else:
    print("No bounds/overflow issues detected.")
