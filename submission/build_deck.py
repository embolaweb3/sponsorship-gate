#!/usr/bin/env python3
"""Builds the Sponsorship Gate pitch deck as a real .pptx file.

Not part of the application; a one-off generation script for the
submission artifact. Run with the venv that has python-pptx installed.
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
    set_text(pg.text_frame, f"{page_no} / 10", size=9, color=GRAY_DIM, align=PP_ALIGN.RIGHT)


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


# =============================================================== SLIDE 1 ==
s = new_slide()

# faint corner accent glow (subtle geometric mark, no imagery)
glow = rect(s, Inches(9.6), Inches(-1.4), Inches(6), Inches(6), fill=RGBColor(0x10, 0x22, 0x22),
            line_color=None, shape=MSO_SHAPE.OVAL)
glow.fill.fore_color.rgb = RGBColor(0x0E, 0x1C, 0x1D)
glow.name = "decorative"

# mark: two nodes (sponsor/sponsee) joined through a shielded gate
cx, cy = Inches(2.0), Inches(2.35)
node_r = Inches(0.28)
n1 = rect(s, cx, cy, node_r, node_r, fill=None, line_color=VIOLET, line_w=Pt(2.25), shape=MSO_SHAPE.OVAL)
n2 = rect(s, cx + Inches(3.1), cy, node_r, node_r, fill=None, line_color=TEAL, line_w=Pt(2.25), shape=MSO_SHAPE.OVAL)
gate = rect(s, cx + Inches(1.28), cy - Inches(0.16), Inches(0.6), Inches(0.6), fill=BG,
            line_color=WHITE, line_w=Pt(2), shape=MSO_SHAPE.DIAMOND)
arrow(s, cx + node_r, cy + node_r / 2, cx + Inches(1.28), cy + node_r / 2, color=GRAY, weight=Pt(1.5))
arrow(s, cx + Inches(1.88), cy + node_r / 2, cx + Inches(3.1), cy + node_r / 2, color=GRAY, weight=Pt(1.5))
lbl1 = textbox(s, cx - Inches(0.35), cy + Inches(0.36), Inches(1.0), Inches(0.3))
set_text(lbl1.text_frame, "sponsee", size=10, color=GRAY, align=PP_ALIGN.CENTER)
lbl2 = textbox(s, cx + Inches(2.75), cy + Inches(0.36), Inches(1.0), Inches(0.3))
set_text(lbl2.text_frame, "sponsor", size=10, color=GRAY, align=PP_ALIGN.CENTER)

title_tb = textbox(s, MARGIN_L, Inches(3.15), Inches(10.5), Inches(1.3))
set_text(title_tb.text_frame, "Sponsorship Gate", size=54, color=WHITE, bold=True)

sub_tb = textbox(s, MARGIN_L, Inches(4.05), Inches(10.2), Inches(0.7))
set_text(sub_tb.text_frame, "Anonymous, rate-limited fee sponsorship for Midnight",
         size=20, color=TEAL, bold=False)

tag_tb = textbox(s, MARGIN_L, Inches(4.65), Inches(10.2), Inches(0.5))
set_text(tag_tb.text_frame,
         "A base-layer-native alternative to account-abstraction paymasters",
         size=13, color=GRAY)

hline(s, MARGIN_L, Inches(5.35), Inches(4.6), color=LINE)
built_on = textbox(s, MARGIN_L, Inches(5.55), Inches(6), Inches(0.4))
set_text(built_on.text_frame, "BUILT ON MIDNIGHT", size=11, color=GRAY_DIM, bold=True)

status_tb = textbox(s, MARGIN_L, Inches(6.85), Inches(11), Inches(0.35))
set_text(status_tb.text_frame,
         "Status: SIMULATED (16/16 tests) · LOCAL infrastructure verified · not yet deployed",
         size=11, color=GRAY_DIM, italic=True)


# =============================================================== SLIDE 2 ==
s = new_slide()
chrome(s, "THE PROBLEM", "Sponsorship and privacy usually trade off", 2)

problems = [
    ("No funds, no first move", "A new user with zero NIGHT/DUST cannot submit any transaction, including the one that would receive help."),
    ("Sponsorship leaks the relationship", "On transparent chains, sponsoring a fee creates a permanent public record of exactly who funded whom."),
    ("Free and anonymous invites abuse", "Remove identity without adding a cost, and sponsorship becomes an open drain for sybil accounts."),
    ("Privacy and abuse-resistance pull apart", "Most designs pick one: identity-gated and safe, or anonymous and exploitable."),
]

card_w = (CONTENT_W - Inches(0.4) * 3) / 4
top = Inches(1.85)
for i, (h, body) in enumerate(problems):
    left = MARGIN_L + i * (card_w + Inches(0.4))
    c = rect(s, left, top, card_w, Inches(3.6), fill=PANEL, line_color=LINE, line_w=Pt(1), radius=0.06)
    num = textbox(s, left + Inches(0.22), top + Inches(0.2), card_w - Inches(0.4), Inches(0.5))
    set_text(num.text_frame, f"0{i+1}", size=22, color=VIOLET, bold=True)
    htb = textbox(s, left + Inches(0.22), top + Inches(0.85), card_w - Inches(0.44), Inches(1.0))
    set_text(htb.text_frame, h, size=15, color=WHITE, bold=True, line_spacing=1.1)
    btb = textbox(s, left + Inches(0.22), top + Inches(1.95), card_w - Inches(0.44), Inches(1.5))
    set_text(btb.text_frame, body, size=11.5, color=GRAY, line_spacing=1.25)

foot = textbox(s, MARGIN_L, Inches(5.75), CONTENT_W, Inches(0.9))
set_text(foot.text_frame,
         "Sponsorship needs privacy for a structural reason, not a cosmetic one — the point of "
         "sponsoring a stranger is anonymous onboarding.",
         size=14, color=TEAL, italic=True, line_spacing=1.2)


# =============================================================== SLIDE 3 ==
s = new_slide()
chrome(s, "OUR SOLUTION", "One gate: anonymous and bounded", 3)

top = Inches(2.15)
bh = Inches(1.15)
bw = Inches(2.1)
gap = Inches(0.35)
x0 = MARGIN_L
positions = []
labels = [
    ("Sponsee", "holds a local secret", PANEL_2, GRAY),
    ("Anonymous\neligibility", "PoW-gated registration", PANEL_2, VIOLET),
    ("Sponsorship\nGate", "epoch-scoped nullifier", PANEL, TEAL),
    ("Sponsor", "holds NIGHT + DUST", PANEL_2, GRAY),
    ("Fee\nbalancing", "balances tx with DUST", PANEL_2, VIOLET),
]
n = len(labels)
total_w = n * bw + (n - 1) * gap
x0 = MARGIN_L + (CONTENT_W - total_w) / 2
for i, (lab, sub, fill, line) in enumerate(labels):
    left = x0 + i * (bw + gap)
    b = flow_box(s, left, top, bw, bh, lab.replace("\n", " "), sub, fill=fill, line=line)
    if i < n - 1:
        arrow(s, left + bw, top + bh / 2, left + bw + gap, top + bh / 2, color=GRAY, weight=Pt(2))

capt = textbox(s, MARGIN_L, top + bh + Inches(0.55), CONTENT_W, Inches(0.5))
set_text(capt.text_frame,
         "The sponsee never reveals who they are. The sponsor never learns who they funded.",
         size=15, color=WHITE, align=PP_ALIGN.CENTER)

# two supporting pillars
py = Inches(4.65)
pw = (CONTENT_W - Inches(0.5)) / 2
for i, (h, b) in enumerate([
    ("PoW-gated registration", "Registering a sponsorship-eligible secret costs real computation, not money or identity — bounding how many identities an attacker can cheaply mint."),
    ("Epoch-scoped nullifiers", "Each registered secret can draw one sponsored action per epoch per pool. The nullifier proves “not used yet,” never who used it."),
]):
    left = MARGIN_L + i * (pw + Inches(0.5))
    c = rect(s, left, py, pw, Inches(1.85), fill=PANEL, line_color=LINE, radius=0.08)
    htb = textbox(s, left + Inches(0.25), py + Inches(0.2), pw - Inches(0.5), Inches(0.4))
    set_text(htb.text_frame, h, size=15, color=TEAL, bold=True)
    btb = textbox(s, left + Inches(0.25), py + Inches(0.68), pw - Inches(0.5), Inches(1.05))
    set_text(btb.text_frame, b, size=12, color=GRAY, line_spacing=1.25)


# =============================================================== SLIDE 4 ==
s = new_slide()
chrome(s, "HOW IT WORKS", "The full protocol flow, step by step", 4)

steps = [
    "Generate a local secret — never transmitted",
    "Solve a PoW puzzle bound to that secret",
    "Register the commitment (once, on-chain)",
    "Prove eligibility: registered + pool active",
    "Derive the epoch nullifier and consume it",
    "Sponsor balances the finalized transaction with sponsor DUST",
    "Transaction proceeds — the sponsee never needed DUST",
]

top = Inches(1.85)
row_h = Inches(0.66)
num_col_w = Inches(0.6)
for i, step in enumerate(steps):
    y = top + i * row_h
    dot_color = TEAL if i < 5 else VIOLET
    circ = rect(s, MARGIN_L, y, Inches(0.42), Inches(0.42), fill=None, line_color=dot_color,
                line_w=Pt(1.75), shape=MSO_SHAPE.OVAL)
    ctf = circ.text_frame
    ctf.vertical_anchor = MSO_ANCHOR.MIDDLE
    set_text(ctf, str(i + 1), size=13, color=dot_color, bold=True, align=PP_ALIGN.CENTER)
    if i < len(steps) - 1:
        hline(s, MARGIN_L + Inches(0.21), y + Inches(0.42), Inches(0.0), color=LINE, weight=Pt(1))
        ln = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, MARGIN_L + Inches(0.21), y + Inches(0.42),
                                     MARGIN_L + Inches(0.21), y + row_h)
        ln.line.color.rgb = LINE
        ln.line.width = Pt(1.25)
        ln.shadow.inherit = False
    txt = textbox(s, MARGIN_L + Inches(0.65), y + Inches(0.02), CONTENT_W - Inches(0.65), Inches(0.42))
    txt.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    set_text(txt.text_frame, step, size=15.5, color=WHITE)

note = textbox(s, MARGIN_L + Inches(6.9), top + Inches(0.05), Inches(5.7), Inches(4.4))
box = rect(s, MARGIN_L + Inches(6.7), top - Inches(0.15), Inches(5.95), Inches(4.55), fill=PANEL,
           line_color=LINE, radius=0.06)
lbl = textbox(s, MARGIN_L + Inches(7.0), top + Inches(0.05), Inches(5.35), Inches(0.4))
set_text(lbl.text_frame, "STEPS 1–5 · on-chain, contract-enforced", size=11, color=TEAL, bold=True)
lbl2 = textbox(s, MARGIN_L + Inches(7.0), top + Inches(2.55), Inches(5.35), Inches(0.4))
set_text(lbl2.text_frame, "STEPS 6–7 · wallet layer, not the contract", size=11, color=VIOLET, bold=True)
d1 = textbox(s, MARGIN_L + Inches(7.0), top + Inches(0.5), Inches(5.35), Inches(1.9))
set_text(d1.text_frame,
         "register() and authorize() are the only two circuits that touch ledger state. "
         "Everything here is what the SIMULATED test suite exercises directly.",
         size=12.5, color=GRAY, line_spacing=1.3)
d2 = textbox(s, MARGIN_L + Inches(7.0), top + Inches(3.0), Inches(5.35), Inches(1.9))
set_text(d2.text_frame,
         "The contract has no way to read or move DUST. Fee balancing happens through "
         "the wallet's own transaction-balancing mechanism, confirmed to exist but not "
         "yet driven end to end.",
         size=12.5, color=GRAY, line_spacing=1.3)


# =============================================================== SLIDE 5 ==
s = new_slide()
chrome(s, "WHY MIDNIGHT", "Native primitives vs. our composition", 5)

col_w = (CONTENT_W - Inches(0.5)) / 2
left1 = MARGIN_L
left2 = MARGIN_L + col_w + Inches(0.5)
top = Inches(1.85)
h = Inches(4.85)

c1 = rect(s, left1, top, col_w, h, fill=PANEL, line_color=TEAL, line_w=Pt(1.25), radius=0.05)
t1 = textbox(s, left1 + Inches(0.3), top + Inches(0.25), col_w - Inches(0.6), Inches(0.45))
set_text(t1.text_frame, "FROM MIDNIGHT", size=13, color=TEAL, bold=True)
midnight_items = [
    "Compact ZK circuits & private witnesses",
    "Sealed / public ledger state split",
    "persistentCommit / persistentHash nullifiers",
    "DUST — shielded, non-transferable fee capacity",
    "Third-party transaction balancing",
    "Contract communications commitment",
    "Wallet / provider infrastructure",
]
yy = top + Inches(0.85)
for item in midnight_items:
    check_row(s, left1 + Inches(0.3), yy, col_w - Inches(0.6), item, color=TEAL, size=13)
    yy += Inches(0.55)

c2 = rect(s, left2, top, col_w, h, fill=PANEL, line_color=VIOLET, line_w=Pt(1.25), radius=0.05)
t2 = textbox(s, left2 + Inches(0.3), top + Inches(0.25), col_w - Inches(0.6), Inches(0.45))
set_text(t2.text_frame, "OUR COMPOSITION", size=13, color=VIOLET, bold=True)
ours_items = [
    "PoW-gated anonymous registration",
    "Epoch-scoped nullifier rate limiting",
    "Sponsor / sponsee trust-boundary model",
    "Transaction-inspection requirement for sponsors",
]
yy = top + Inches(0.85)
for item in ours_items:
    check_row(s, left2 + Inches(0.3), yy, col_w - Inches(0.6), item, color=VIOLET, size=13)
    yy += Inches(0.55)
note2 = textbox(s, left2 + Inches(0.3), yy + Inches(0.25), col_w - Inches(0.6), Inches(1.6))
set_text(note2.text_frame,
         "Neither PoW-as-sybil-cost nor nullifier rate-limiting is new cryptography. "
         "The contribution is this composition, using primitives Midnight already "
         "ships natively instead of retrofitting them on a transparent chain.",
         size=11.5, color=GRAY, line_spacing=1.3)


# =============================================================== SLIDE 6 ==
s = new_slide()
chrome(s, "SECURITY MODEL", "Enforced by the protocol vs. left to the sponsor", 6)

left = MARGIN_L
top = Inches(1.85)
w = Inches(7.4)
h = Inches(4.85)
c = rect(s, left, top, w, h, fill=PANEL, line_color=LINE, radius=0.05)
lbl = textbox(s, left + Inches(0.3), top + Inches(0.22), w - Inches(0.6), Inches(0.4))
set_text(lbl.text_frame, "TESTED PROTOCOL GUARANTEES", size=12.5, color=TEAL, bold=True)
guarantees = [
    "PoW is bound to the registration secret",
    "No duplicate registration, even with a fresh nonce",
    "One authorization per pool, per epoch",
    "The same secret authorizes again next epoch",
    "No replay across independently deployed pools",
    "Out-of-window epochs are rejected",
    "Inactive pools reject registration and authorization",
    "Only the genuine owner secret can deactivate a pool",
    "Competing authorizations collapse to one replay check",
]
yy = top + Inches(0.72)
for g in guarantees:
    check_row(s, left + Inches(0.3), yy, w - Inches(0.6), g, color=TEAL, size=12.5)
    yy += Inches(0.455)

right_left = left + w + Inches(0.4)
right_w = CONTENT_W - w - Inches(0.4)
box = rect(s, right_left, top, right_w, Inches(2.2), fill=PANEL_2, line_color=AMBER, line_w=Pt(1.5), radius=0.06)
lbl2 = textbox(s, right_left + Inches(0.25), top + Inches(0.2), right_w - Inches(0.5), Inches(0.4))
set_text(lbl2.text_frame, "TRUST BOUNDARY", size=12, color=AMBER, bold=True)
btxt = textbox(s, right_left + Inches(0.25), top + Inches(0.65), right_w - Inches(0.5), Inches(1.45))
set_text(btxt.text_frame,
         "A nullifier alone is not proof of which transaction produced it. The sponsor "
         "must inspect the candidate transaction's own authorization effect before balancing it.",
         size=12.5, color=WHITE, line_spacing=1.3)

box2 = rect(s, right_left, top + Inches(2.5), right_w, Inches(2.35), fill=PANEL, line_color=LINE, radius=0.06)
lbl3 = textbox(s, right_left + Inches(0.25), top + Inches(2.65), right_w - Inches(0.5), Inches(0.55))
set_text(lbl3.text_frame, "16 / 16", size=30, color=TEAL, bold=True)
lbl4 = textbox(s, right_left + Inches(0.25), top + Inches(3.35), right_w - Inches(0.5), Inches(1.3))
set_text(lbl4.text_frame,
         "tests passing — SIMULATED, against the compiled circuit with --skip-zk. "
         "Includes the authorization-binding adversarial suite above.",
         size=12, color=GRAY, line_spacing=1.3)


# =============================================================== SLIDE 7 ==
s = new_slide()
chrome(s, "WHAT WE ACTUALLY BUILT", "Concrete artifacts, not a concept", 7)

items = [
    ("sponsorship-gate.compact", "On-chain gate: PoW-gated registration, epoch-scoped authorization, owner deactivation."),
    ("witnesses.ts", "Production sponsee witness implementation — local secret, never transmitted."),
    ("pow.ts", "PoW nonce mining shared by tests and real clients — no duplicated hash logic."),
    ("sponsor-policy.ts", "Off-chain sponsor decision logic and the transaction-inspection requirement."),
    ("Adversarial test suite", "16/16 tests: replay, cross-pool, epoch, ownership, and nullifier-binding attacks."),
    ("Real local infrastructure", "A real Midnight node, indexer, and proof server — run and confirmed healthy."),
]

col_w = (CONTENT_W - Inches(0.4) * 2) / 3
row_h = Inches(2.15)
top = Inches(1.85)
for i, (h, b) in enumerate(items):
    r, cidx = divmod(i, 3)
    left = MARGIN_L + cidx * (col_w + Inches(0.4))
    y = top + r * (row_h + Inches(0.35))
    c = rect(s, left, y, col_w, row_h, fill=PANEL, line_color=LINE, radius=0.07)
    htb = textbox(s, left + Inches(0.22), y + Inches(0.2), col_w - Inches(0.44), Inches(0.5))
    set_text(htb.text_frame, h, size=14, color=TEAL, bold=True, font=MONO if "." in h or "()" in h else FONT)
    btb = textbox(s, left + Inches(0.22), y + Inches(0.75), col_w - Inches(0.44), Inches(1.3))
    set_text(btb.text_frame, b, size=11.5, color=GRAY, line_spacing=1.25)


# =============================================================== SLIDE 8 ==
s = new_slide()
chrome(s, "EVIDENCE & CURRENT STATUS", "Exactly what is verified, nothing more", 8)

cols = [
    ("VERIFIED LOCAL", TEAL, [
        "Real Midnight node",
        "Real indexer",
        "Real proof server",
        "Real funded wallet (NIGHT + DUST)",
        "Real NIGHT transfer transaction",
        "Real DUST registration transaction",
    ]),
    ("VERIFIED SIMULATED", VIOLET, [
        "16/16 protocol / circuit tests",
        "Authorization-binding adversarial tests",
        "Compiled circuit, --skip-zk",
    ]),
    ("NOT YET COMPLETED", RED_SOFT, [
        "Contract deployment",
        "Real contract interaction",
        "Two-party sponsored transaction",
        "Preprod deployment",
    ]),
]
col_w = (CONTENT_W - Inches(0.4) * 2) / 3
top = Inches(1.85)
h = Inches(4.3)
for i, (title, color, rows) in enumerate(cols):
    left = MARGIN_L + i * (col_w + Inches(0.4))
    c = rect(s, left, top, col_w, h, fill=PANEL, line_color=color, line_w=Pt(1.5), radius=0.05)
    band = rect(s, left, top, col_w, Inches(0.55), fill=color, line_color=None, radius=0.0)
    # round only top by overlaying a plain rect under rounded card corners is complex;
    # use a simple header text on the card instead of a separate band shape.
    band._element.getparent().remove(band._element)
    lbl = textbox(s, left + Inches(0.25), top + Inches(0.22), col_w - Inches(0.5), Inches(0.45))
    set_text(lbl.text_frame, title, size=13.5, color=color, bold=True)
    yy = top + Inches(0.85)
    for r in rows:
        dot = status_dot(s, left + Inches(0.28), yy + Inches(0.03), color, size=Inches(0.12))
        tb = textbox(s, left + Inches(0.55), yy - Inches(0.06), col_w - Inches(0.8), Inches(0.5))
        set_text(tb.text_frame, r, size=12, color=WHITE, line_spacing=1.05)
        yy += Inches(0.52)

foot = textbox(s, MARGIN_L, Inches(6.4), CONTENT_W, Inches(0.5))
set_text(foot.text_frame, "No LIVE transaction has been completed.", size=14, color=AMBER, bold=True,
         align=PP_ALIGN.CENTER)


# =============================================================== SLIDE 9 ==
s = new_slide()
chrome(s, "WHY THIS MATTERS", "The broader infrastructure gap", 9)

quote = textbox(s, MARGIN_L + Inches(0.5), Inches(2.2), CONTENT_W - Inches(1.0), Inches(1.6))
set_text(quote.text_frame,
         "Private sponsorship should not require forcing every user into a "
         "publicly attributable relationship with whoever funds them.",
         size=26, color=WHITE, bold=True, line_spacing=1.25)

hline(s, MARGIN_L, Inches(4.15), Inches(3.2), color=LINE)

body = textbox(s, MARGIN_L, Inches(4.45), CONTENT_W, Inches(2.0))
set_text(body.text_frame,
         "Ethereum's own ecosystem is retrofitting privacy onto account-abstraction paymasters "
         "after the fact — a draft ERC, a separate TEE-based workaround. Midnight already ships "
         "a shielded, non-transferable fee-capacity resource and third-party transaction balancing "
         "as base-layer primitives. Sponsorship Gate is what a sponsorship layer looks like when it's "
         "built on those primitives from the start, instead of bolted on afterward.",
         size=15, color=GRAY, line_spacing=1.4)


# ============================================================== SLIDE 10 ==
s = new_slide()

glow = rect(s, Inches(-1.5), Inches(3.2), Inches(6), Inches(6), fill=RGBColor(0x0E, 0x1C, 0x1D),
            line_color=None, shape=MSO_SHAPE.OVAL)
glow.name = "decorative"

title_tb = textbox(s, MARGIN_L, Inches(2.6), Inches(11.5), Inches(1.1))
set_text(title_tb.text_frame, "Sponsorship Gate", size=46, color=WHITE, bold=True)

thesis = textbox(s, MARGIN_L, Inches(3.65), Inches(11.5), Inches(1.0))
set_text(thesis.text_frame,
         "Private sponsorship should be a protocol primitive, not an identity leak.",
         size=20, color=TEAL, italic=False)

hline(s, MARGIN_L, Inches(4.85), Inches(4.6), color=LINE)

status_tb = textbox(s, MARGIN_L, Inches(5.05), Inches(11), Inches(0.9))
add_multiline(status_tb.text_frame, [
    ("SIMULATED: 16/16 tests passing", {"size": 13, "color": VIOLET, "bold": True, "space_after": 4}),
    ("LOCAL: real Midnight infrastructure verified, wallet funded on-chain", {"size": 13, "color": TEAL, "bold": True, "space_after": 4}),
    ("Not yet LIVE — deployment and the two-party sponsored transaction are the next milestone", {"size": 13, "color": GRAY, "bold": False}),
], line_spacing=1.15)

built_on = textbox(s, MARGIN_L, Inches(6.9), Inches(6), Inches(0.4))
set_text(built_on.text_frame, "BUILT ON MIDNIGHT", size=11, color=GRAY_DIM, bold=True)


out_dir = os.path.dirname(os.path.abspath(__file__))
out_path = os.path.join(out_dir, "Sponsorship-Gate-Pitch-Deck.pptx")
prs.save(out_path)
print("saved:", out_path)
print("slides:", len(prs.slides))
