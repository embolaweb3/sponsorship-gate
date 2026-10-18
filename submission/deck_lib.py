#!/usr/bin/env python3
"""Shared helpers for the Sponsorship Gate decks (palette, text, shapes, chrome).

Extracted from build_deck.py so the wave 1 and wave 2 decks share one look.
Importing this module creates the Presentation (prs) the deck scripts fill.
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.oxml.ns import qn

# ---------------------------------------------------------------- palette --
BG        = RGBColor(0x0A, 0x0E, 0x16)   # near-black navy
PANEL     = RGBColor(0x11, 0x17, 0x22)   # card panel
PANEL_2   = RGBColor(0x16, 0x1D, 0x2A)   # slightly lighter card
LINE      = RGBColor(0x27, 0x30, 0x3F)   # hairline / borders
TEAL      = RGBColor(0x2D, 0xD4, 0xBF)   # primary accent (verified / teal)
VIOLET    = RGBColor(0x9B, 0x7B, 0xF6)   # secondary accent (simulated)
AMBER     = RGBColor(0xF5, 0xA6, 0x23)   # caution / not-yet
RED_SOFT  = RGBColor(0xE0, 0x6B, 0x6B)   # for "not completed" markers
WHITE     = RGBColor(0xF4, 0xF6, 0xF8)
GRAY      = RGBColor(0x8B, 0x94, 0xA3)
GRAY_DIM  = RGBColor(0x5B, 0x64, 0x73)

FONT = "Arial"
MONO = "Consolas"

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
MARGIN_L = Inches(0.65)
MARGIN_R = Inches(0.65)
CONTENT_W = SLIDE_W - MARGIN_L - MARGIN_R

prs = Presentation()
prs.slide_width = SLIDE_W
prs.slide_height = SLIDE_H
BLANK = prs.slide_layouts[6]


# ------------------------------------------------------------- utilities --
def new_slide():
    s = prs.slides.add_slide(BLANK)
    bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H)
    bg.fill.solid()
    bg.fill.fore_color.rgb = BG
    bg.line.fill.background()
    bg.shadow.inherit = False
    bg.name = "background"
    # send to back (it's the first shape already, but be explicit-safe)
    return s


def set_text(tf, text, size=18, color=WHITE, bold=False, font=FONT,
             align=PP_ALIGN.LEFT, line_spacing=1.0, italic=False):
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.alignment = align
    if line_spacing:
        p.line_spacing = line_spacing
    p.text = ""
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.name = font
    run.font.color.rgb = color
    return p


def add_multiline(tf, lines, size=16, color=WHITE, bold=False, font=FONT,
                   align=PP_ALIGN.LEFT, line_spacing=1.15, space_after=6):
    """lines: list of (text, overrides-dict) or plain strings."""
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    first = True
    for item in lines:
        if isinstance(item, tuple):
            text, ov = item
        else:
            text, ov = item, {}
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = ov.get("align", align)
        p.line_spacing = ov.get("line_spacing", line_spacing)
        p.space_after = Pt(ov.get("space_after", space_after))
        run = p.add_run()
        run.text = text
        run.font.size = Pt(ov.get("size", size))
        run.font.bold = ov.get("bold", bold)
        run.font.italic = ov.get("italic", False)
        run.font.name = ov.get("font", font)
        run.font.color.rgb = ov.get("color", color)


def textbox(slide, left, top, width, height, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tb.text_frame.vertical_anchor = anchor
    tb.text_frame.word_wrap = True
    return tb


def rect(slide, left, top, width, height, fill=None, line_color=None,
         line_w=Pt(0.75), shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=None):
    sp = slide.shapes.add_shape(shape, left, top, width, height)
    sp.shadow.inherit = False
    if fill is None:
        sp.fill.background()
    else:
        sp.fill.solid()
        sp.fill.fore_color.rgb = fill
    if line_color is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line_color
        sp.line.width = line_w
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE and radius is not None:
        try:
            sp.adjustments[0] = radius
        except Exception:
            pass
    return sp


def hline(slide, left, top, width, color=LINE, weight=Pt(1)):
    ln = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, left, top, left + width, top)
    ln.line.color.rgb = color
    ln.line.width = weight
    ln.shadow.inherit = False
    return ln


def arrow(slide, x1, y1, x2, y2, color=TEAL, weight=Pt(2)):
    cn = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, x1, y1, x2, y2)
    cn.line.color.rgb = color
    cn.line.width = weight
    cn.shadow.inherit = False
    line = cn.line._get_or_add_ln()
    tail = line.makeelement(qn('a:tailEnd'), {'type': 'triangle', 'w': 'med', 'len': 'med'})
    line.append(tail)
    return cn


TOTAL_PAGES = 10


def chrome(slide, eyebrow, title, page_no):
    """Standard header/footer chrome for content slides."""
    eb = textbox(slide, MARGIN_L, Inches(0.42), Inches(6), Inches(0.32))
    set_text(eb.text_frame, eyebrow, size=12, color=TEAL, bold=True, font=FONT)
    eb.text_frame.paragraphs[0].font.name = FONT
    for r in eb.text_frame.paragraphs[0].runs:
        r.font.name = FONT
    tt = textbox(slide, MARGIN_L, Inches(0.72), CONTENT_W, Inches(0.72))
    set_text(tt.text_frame, title, size=26, color=WHITE, bold=True)
    hline(slide, MARGIN_L, Inches(1.52), CONTENT_W, color=LINE, weight=Pt(1))
    # footer
    ft = textbox(slide, MARGIN_L, Inches(7.08), Inches(6), Inches(0.3))
    set_text(ft.text_frame, "SPONSORSHIP GATE", size=9, color=GRAY_DIM, bold=True)
    pg = textbox(slide, SLIDE_W - MARGIN_R - Inches(1.2), Inches(7.08), Inches(1.2), Inches(0.3))
    set_text(pg.text_frame, f"{page_no} / {TOTAL_PAGES}", size=9, color=GRAY_DIM, align=PP_ALIGN.RIGHT)


def status_dot(slide, left, top, color, size=Inches(0.14)):
    d = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, top, size, size)
    d.fill.solid()
    d.fill.fore_color.rgb = color
    d.line.fill.background()
    d.shadow.inherit = False
    return d


def check_row(slide, left, top, width, text, color=TEAL, size=14):
    status_dot(slide, left, top + Inches(0.03), color, size=Inches(0.12))
    tb = textbox(slide, left + Inches(0.26), top - Inches(0.06), width - Inches(0.26), Inches(0.4))
    set_text(tb.text_frame, text, size=size, color=WHITE)
    return tb


def flow_box(slide, left, top, width, height, label, sublabel=None, fill=PANEL_2, line=TEAL):
    b = rect(slide, left, top, width, height, fill=fill, line_color=line, line_w=Pt(1.25), radius=0.12)
    tf = b.text_frame
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = Inches(0.12)
    tf.margin_right = Inches(0.12)
    lines = [(label, {"size": 15, "bold": True, "color": WHITE, "align": PP_ALIGN.CENTER, "space_after": 2})]
    if sublabel:
        lines.append((sublabel, {"size": 10.5, "bold": False, "color": GRAY, "align": PP_ALIGN.CENTER, "space_after": 0}))
    add_multiline(tf, lines, align=PP_ALIGN.CENTER, line_spacing=1.05)
    return b

