#!/usr/bin/env python3
"""Builds the Wave 2 Sponsorship Gate pitch deck (.pptx).

Run with a Python that has python-pptx:  python3 build_deck_wave2.py
Every number on these slides is taken from the repository: test counts from
`npm test` output, transaction ids/blocks/fees from integration/evidence-local.json.
"""
import json
import os

import deck_lib as D
from deck_lib import *  # noqa: F401,F403  (palette, helpers, prs)

HERE = os.path.dirname(os.path.abspath(__file__))
EVID = json.load(open(os.path.join(HERE, "..", "integration", "evidence-local.json")))
ASSETS = os.path.join(HERE, "assets")

D.TOTAL_PAGES = 12


def pic(slide, name, left, top, width, max_h):
    """Place a screenshot at `width`, cropping from the bottom so it is at most max_h tall."""
    p = slide.shapes.add_picture(os.path.join(ASSETS, name), left, top, width=width)
    if p.height > max_h:
        keep = max_h / p.height
        p.crop_bottom = 1 - keep
        p.height = int(max_h)
    p.line.color.rgb = LINE
    p.line.width = Pt(1)
    return p


def card(slide, left, top, w, h, title, body, title_color=TEAL, body_size=12, fill=PANEL):
    rect(slide, left, top, w, h, fill=fill, line_color=LINE, radius=0.06)
    t = textbox(slide, left + Inches(0.22), top + Inches(0.18), w - Inches(0.44), Inches(0.45))
    set_text(t.text_frame, title, size=14, color=title_color, bold=True)
    b = textbox(slide, left + Inches(0.22), top + Inches(0.68), w - Inches(0.44), h - Inches(0.8))
    set_text(b.text_frame, body, size=body_size, color=GRAY, line_spacing=1.25)


def short(h, n=8):
    return f"{h[:n]}…{h[-n:]}"


# =============================================================== SLIDE 1 ==
s = new_slide()
glow = rect(s, Inches(9.6), Inches(-1.4), Inches(6), Inches(6), fill=RGBColor(0x0E, 0x1C, 0x1D), line_color=None, shape=MSO_SHAPE.OVAL)
glow.name = "decorative"
cx, cy = Inches(2.0), Inches(2.0)
node_r = Inches(0.28)
rect(s, cx, cy, node_r, node_r, fill=None, line_color=VIOLET, line_w=Pt(2.25), shape=MSO_SHAPE.OVAL)
rect(s, cx + Inches(3.1), cy, node_r, node_r, fill=None, line_color=TEAL, line_w=Pt(2.25), shape=MSO_SHAPE.OVAL)
rect(s, cx + Inches(1.28), cy - Inches(0.16), Inches(0.6), Inches(0.6), fill=BG, line_color=WHITE, line_w=Pt(2), shape=MSO_SHAPE.DIAMOND)
arrow(s, cx + node_r, cy + node_r / 2, cx + Inches(1.28), cy + node_r / 2, color=GRAY, weight=Pt(1.5))
arrow(s, cx + Inches(1.88), cy + node_r / 2, cx + Inches(3.1), cy + node_r / 2, color=GRAY, weight=Pt(1.5))

t = textbox(s, MARGIN_L, Inches(2.85), Inches(11), Inches(1.0))
set_text(t.text_frame, "Sponsorship Gate", size=54, color=WHITE, bold=True)
t = textbox(s, MARGIN_L, Inches(3.8), Inches(11.5), Inches(0.6))
set_text(t.text_frame, "Wave 2: we found a privacy leak in our own contract, fixed it, and proved it on a real chain", size=20, color=TEAL)
t = textbox(s, MARGIN_L, Inches(4.45), Inches(11), Inches(0.5))
set_text(t.text_frame, "Anonymous, rate-limited fee sponsorship for Midnight", size=14, color=GRAY)

hline(s, MARGIN_L, Inches(5.3), Inches(4.6))
chips = [("54 automated tests", TEAL), ("real devnet transactions", TEAL), ("web console, no wallet needed", VIOLET)]
x = MARGIN_L
for label, col in chips:
    w = Inches(0.35 + 0.115 * len(label))
    rect(s, x, Inches(5.55), w, Inches(0.42), fill=PANEL, line_color=col, line_w=Pt(1), radius=0.5)
    tb = textbox(s, x, Inches(5.55), w, Inches(0.42), anchor=MSO_ANCHOR.MIDDLE)
    set_text(tb.text_frame, label, size=11, color=WHITE, align=PP_ALIGN.CENTER, bold=True)
    x += w + Inches(0.2)
t = textbox(s, MARGIN_L, Inches(6.85), Inches(12), Inches(0.35))
set_text(t.text_frame, "Status: SIMULATED (34 contract tests) · LOCAL real devnet (deploy + 3 sponsored txs) · LIVE (Preprod) not yet", size=11, color=GRAY_DIM, italic=True)

# =============================================================== SLIDE 2 ==
s = new_slide()
chrome(s, "RECAP", "The problem, in one line", 2)
t = textbox(s, MARGIN_L, Inches(1.95), CONTENT_W, Inches(1.4))
set_text(t.text_frame, "A new user has no funds, so someone must pay their first fee. On a transparent chain that payment is a permanent public record of who funded whom.", size=24, color=WHITE, line_spacing=1.2)
cw = (CONTENT_W - Inches(0.8)) / 3
items = [
    ("Privacy", "The sponsor should never learn who they sponsored, and nobody should be able to group one person's requests."),
    ("Abuse resistance", "Anonymous plus free is an open drain. Each identity must cost something, and each request must be bounded."),
    ("Sponsor safety", "The sponsor pays real fees. It must only ever pay for exactly the call it agreed to."),
]
for i, (h, b) in enumerate(items):
    card(s, MARGIN_L + i * (cw + Inches(0.4)), Inches(3.9), cw, Inches(2.4), h, b, body_size=13)

# =============================================================== SLIDE 3 ==
s = new_slide()
chrome(s, "WAVE 1 → WAVE 2", "What changed, and what we got wrong", 3)
rows = [
    ("Wave 1", "Contract + 16 simulated tests. Deployment never completed. No UI. A sponsor service that was only specified.", GRAY, VIOLET),
    ("Found", "authorize() published the caller's commitment in the public transcript, linking every request a member ever made. Our own tests could not see it.", RED_SOFT, RED_SOFT),
    ("Fixed", "Merkle-membership proof. Only the root is disclosed. A transcript-level regression test plus a Wave 1 control contract prove the leak is gone.", TEAL, TEAL),
    ("Shipped", "Quota slots · on-chain budget cap + topUp · sponsor-side inspector · real two-party flow on a devnet · in-browser console · pinned devnet stack.", TEAL, TEAL),
]
y = Inches(1.9)
for label, body, lc, dot in rows:
    rect(s, MARGIN_L, y, CONTENT_W, Inches(1.05), fill=PANEL, line_color=LINE, radius=0.08)
    status_dot(s, MARGIN_L + Inches(0.25), y + Inches(0.4), dot, size=Inches(0.2))
    t = textbox(s, MARGIN_L + Inches(0.65), y + Inches(0.3), Inches(1.5), Inches(0.5))
    set_text(t.text_frame, label, size=16, color=lc, bold=True)
    t = textbox(s, MARGIN_L + Inches(2.3), y + Inches(0.16), CONTENT_W - Inches(2.6), Inches(0.8), anchor=MSO_ANCHOR.MIDDLE)
    set_text(t.text_frame, body, size=13.5, color=WHITE, line_spacing=1.2)
    y += Inches(1.2)

# =============================================================== SLIDE 4 ==
s = new_slide()
chrome(s, "THE FINDING", "A ledger query is not a state write, and it is public", 4)
t = textbox(s, MARGIN_L, Inches(1.75), CONTENT_W, Inches(0.8))
set_text(t.text_frame, "Wave 1 checked membership with registered.member(commitment). The compiler happily accepted it, because the commitment is a hash, not raw witness data. But a query argument goes into the public transcript.", size=13.5, color=GRAY, line_spacing=1.25)
cw = (CONTENT_W - Inches(0.4)) / 2
for i, (title, col, lines) in enumerate([
    ("WAVE 1 · authorize() transcript", RED_SOFT, [
        ("1. 9b06f1f30ce4370f682bb2f3f2aa0622…243b64ebf2b7ec3", {"color": RED_SOFT, "bold": True, "font": MONO}),
        ("    ← the member's commitment, in public", {"color": RED_SOFT, "size": 11}),
        ("2. 0707070707070707…", {"font": MONO}),
        ("3. f882a3549828bf46…", {"font": MONO}),
        ("Anyone can group all of one member's requests.", {"color": RED_SOFT, "size": 13, "bold": True}),
    ]),
    ("WAVE 2 · authorize() transcript", TEAL, [
        ("1. 3fc0b14abfa80c56800411444747e9c5…", {"font": MONO}),
        ("    ← a Merkle root (shared by all members)", {"color": TEAL, "size": 11}),
        ("2. 0707070707070707…", {"font": MONO}),
        ("3. dedcc12bf176573055ec369a53db82a5…", {"font": MONO}),
        ("    ← a fresh nullifier, unlinkable", {"color": TEAL, "size": 11}),
        ("The member is one of N, indistinguishable.", {"color": TEAL, "size": 13, "bold": True}),
    ]),
]):
    left = MARGIN_L + i * (cw + Inches(0.4))
    rect(s, left, Inches(2.75), cw, Inches(2.9), fill=PANEL, line_color=col, line_w=Pt(1.25), radius=0.05)
    t = textbox(s, left + Inches(0.25), Inches(2.9), cw - Inches(0.5), Inches(0.4))
    set_text(t.text_frame, title, size=12, color=col, bold=True)
    b = textbox(s, left + Inches(0.25), Inches(3.4), cw - Inches(0.5), Inches(2.2))
    add_multiline(b.text_frame, lines, size=12, color=WHITE, line_spacing=1.2, space_after=5)
t = textbox(s, MARGIN_L, Inches(5.95), CONTENT_W, Inches(0.9))
set_text(t.text_frame, "How we know the test can fail: the same check, run on the preserved Wave 1 contract, finds the commitment. Run on Wave 2, it does not. Both are in the suite.", size=13.5, color=WHITE, line_spacing=1.25)

# =============================================================== SLIDE 5 ==
s = new_slide()
chrome(s, "THE FIX", "Prove membership without saying where", 5)
# tree
top = Inches(2.0)
root = rect(s, Inches(1.0), top, Inches(1.7), Inches(0.6), fill=PANEL_2, line_color=TEAL, line_w=Pt(1.5), radius=0.2)
tb = root.text_frame; tb.vertical_anchor = MSO_ANCHOR.MIDDLE
set_text(tb, "root  (public)", size=12, color=TEAL, bold=True, align=PP_ALIGN.CENTER)
lvl = []
for i in range(2):
    n = rect(s, Inches(0.2) + i * Inches(2.5), top + Inches(1.2), Inches(1.5), Inches(0.55), fill=PANEL, line_color=LINE, radius=0.2)
    set_text(n.text_frame, "hash", size=11, color=GRAY, align=PP_ALIGN.CENTER)
    n.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    lvl.append(n)
    arrow(s, Inches(1.85), top + Inches(0.6), Inches(0.95) + i * Inches(2.5), top + Inches(1.2), color=LINE, weight=Pt(1.25))
leaves = []
for i in range(4):
    mine = i == 1
    lf = rect(s, Inches(0.05) + i * Inches(1.25), top + Inches(2.4), Inches(1.1), Inches(0.55), fill=PANEL_2 if mine else PANEL, line_color=VIOLET if mine else LINE, line_w=Pt(1.5 if mine else 1), radius=0.2)
    set_text(lf.text_frame, "you" if mine else "member", size=11, color=VIOLET if mine else GRAY, bold=mine, align=PP_ALIGN.CENTER)
    lf.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    arrow(s, Inches(0.95) + (i // 2) * Inches(2.5), top + Inches(1.75), Inches(0.6) + i * Inches(1.25), top + Inches(2.4), color=LINE, weight=Pt(1.25))
t = textbox(s, Inches(0.2), top + Inches(3.15), Inches(5), Inches(1.1))
set_text(t.text_frame, "Your path to the root is private witness data. The circuit hashes it up and discloses only the root.", size=12, color=GRAY, line_spacing=1.25)

pts = [
    ("register", "Disclose your commitment once. Inserted into a Set (duplicate check) and a Merkle tree (membership)."),
    ("authorize", "Prove path → root, disclose only the root. Spend nullifier H(pool, epoch, slot, secret)."),
    ("Historic roots", "Older roots stay valid, so registering later never locks an earlier member out."),
    ("Honest limit", "The anonymity set is the pool's size. A one-member pool hides nothing."),
]
y = Inches(1.9)
for h, b in pts:
    col = AMBER if h == "Honest limit" else TEAL
    rect(s, Inches(6.4), y, Inches(6.28), Inches(1.1), fill=PANEL, line_color=LINE, radius=0.08)
    t = textbox(s, Inches(6.65), y + Inches(0.12), Inches(5.8), Inches(0.35))
    set_text(t.text_frame, h, size=13.5, color=col, bold=True)
    t = textbox(s, Inches(6.65), y + Inches(0.48), Inches(5.8), Inches(0.6))
    set_text(t.text_frame, b, size=11.5, color=GRAY, line_spacing=1.2)
    y += Inches(1.22)

# =============================================================== SLIDE 6 ==
s = new_slide()
chrome(s, "CONTRACT", "Four circuits, three new guarantees", 6)
cw = (CONTENT_W - Inches(0.8)) / 3
newf = [
    ("Quota slots", "authorize(epoch, slot). A pool grants N authorizations per member per epoch. Each slot is its own nullifier, single-use, refreshed every epoch.", TEAL),
    ("On-chain budget", "The contract cannot read DUST, so the sponsor commits to a ceiling it can enforce: maxAuthorizations + a counter. A pool-wide stop that holds even if every member cheats.", TEAL),
    ("topUp (owner)", "The budget can only go up, never down. Members are never promised capacity that is then taken back. Closing is deactivate().", TEAL),
]
for i, (h, b, c) in enumerate(newf):
    card(s, MARGIN_L + i * (cw + Inches(0.4)), Inches(1.9), cw, Inches(2.8), h, b, title_color=c, body_size=12.5)
rect(s, MARGIN_L, Inches(4.95), CONTENT_W, Inches(1.8), fill=PANEL, line_color=LINE, radius=0.06)
t = textbox(s, MARGIN_L + Inches(0.3), Inches(5.1), CONTENT_W - Inches(0.6), Inches(0.4))
set_text(t.text_frame, "CIRCUITS", size=11, color=VIOLET, bold=True)
add_multiline(textbox(s, MARGIN_L + Inches(0.3), Inches(5.5), CONTENT_W - Inches(0.6), Inches(1.2)).text_frame, [
    ("register(nonce)       PoW-gated, one-time commitment insert (Set + Merkle tree)", {"font": MONO, "size": 12}),
    ("authorize(epoch, slot)   Merkle membership + epoch window + quota + budget + nullifier", {"font": MONO, "size": 12}),
    ("topUp(newMax)         owner-only, increase-only        deactivate()   owner-only", {"font": MONO, "size": 12}),
], size=12, color=WHITE, space_after=4)

# =============================================================== SLIDE 7 ==
s = new_slide()
chrome(s, "REAL TWO-PARTY FLOW", "An unfunded wallet, paid for by someone else", 7)
bw, bh, gap = Inches(2.0), Inches(1.25), Inches(0.45)
labels = [
    ("Sponsee", "no NIGHT, no DUST, no wallet", GRAY),
    ("Builds + proves", "register / authorize, locally", VIOLET),
    ("Sponsor inspects", "exactly one sponsored call?", TEAL),
    ("Balances with DUST", "balanceUnboundTransaction", TEAL),
    ("On-chain", "block + indexer", GRAY),
]
n = len(labels)
total = n * bw + (n - 1) * gap
x0 = MARGIN_L + (CONTENT_W - total) / 2
for i, (a, b, c) in enumerate(labels):
    left = x0 + i * (bw + gap)
    flow_box(s, left, Inches(1.95), bw, bh, a, b, fill=PANEL_2, line=c)
    if i < n - 1:
        arrow(s, left + bw, Inches(1.95) + bh / 2, left + bw + gap, Inches(1.95) + bh / 2, color=GRAY, weight=Pt(2))
cw = (CONTENT_W - Inches(0.4)) / 2
card(s, MARGIN_L, Inches(3.6), cw, Inches(3.15), "What happened on the devnet", (
    "Pool deployed, then the unfunded sponsee registered and authorized two slots. Each transaction was balanced and submitted by the sponsor.\n\n"
    f"Fees paid by the sponsor: {int(EVID['sponsorFeesPaid']):,} DUST-units across 3 transactions.\nFees paid by the sponsee: 0."
), body_size=12.5)
card(s, MARGIN_L + cw + Inches(0.4), Inches(3.6), cw, Inches(3.15), "A byte-level privacy check, on the real chain", (
    "We search each submitted transaction's actual bytes for the sponsee's commitment.\n\n"
    "register: found (the positive control, proving the check can see it).\n"
    "authorize x2: not found.\n\n"
    "The Wave 2 contract does not leak the commitment on a real network, not only in simulation."
), title_color=TEAL, body_size=12.5)

# =============================================================== SLIDE 8 ==
s = new_slide()
chrome(s, "SPONSOR SAFETY", "The sponsor pays only for exactly what it agreed to", 8)
t = textbox(s, MARGIN_L, Inches(1.7), CONTENT_W, Inches(0.7))
set_text(t.text_frame, "A nullifier says nothing about the transaction it travels in. So before spending DUST, the sponsor inspects the candidate itself. Same function in the devnet service, the unit tests, and the browser.", size=13, color=GRAY, line_spacing=1.25)
rows = [
    ("NOT_A_CALL", "A smuggled contract deploy or maintenance update", "refused on a real ContractDeploy"),
    ("TOO_MANY_ACTIONS", "Five authorize calls bundled to inflate the fee", "unit-tested"),
    ("WRONG_CONTRACT", "A valid-looking call to some other contract", "unit-tested"),
    ("ENTRY_POINT_NOT_SPONSORED", "topUp / deactivate: owner-only, never a stranger's", "unit-tested"),
    ("HAS_ZSWAP_MOVEMENT", "Shielded value moving; a sponsor pays fees, not transfers", "unit-tested"),
    ("NULLIFIER_ALREADY_SPENT", "A replay that would fail on-chain after the sponsor paid", "unit-tested"),
]
y = Inches(2.55)
hdr = [("Refusal", Inches(3.3)), ("Attack", Inches(5.7)), ("Evidence", Inches(3.0))]
x = MARGIN_L
for h, w in hdr:
    t = textbox(s, x + Inches(0.15), y, w, Inches(0.3))
    set_text(t.text_frame, h.upper(), size=10, color=GRAY_DIM, bold=True)
    x += w
hline(s, MARGIN_L, y + Inches(0.32), CONTENT_W)
y += Inches(0.42)
for code, attack, ev in rows:
    x = MARGIN_L
    real = "real" in ev
    for j, (txt, w) in enumerate(zip([code, attack, ev], [h[1] for h in hdr])):
        t = textbox(s, x + Inches(0.15), y + Inches(0.06), w - Inches(0.2), Inches(0.45), anchor=MSO_ANCHOR.MIDDLE)
        col = (TEAL if real else GRAY) if j == 2 else (RED_SOFT if j == 0 else WHITE)
        set_text(t.text_frame, txt, size=11.5 if j else 11, color=col, bold=(j == 0), font=MONO if j == 0 else FONT)
        x += w
    hline(s, MARGIN_L, y + Inches(0.56), CONTENT_W, color=LINE, weight=Pt(0.5))
    y += Inches(0.62)
t = textbox(s, MARGIN_L, Inches(6.55), CONTENT_W, Inches(0.4))
set_text(t.text_frame, "Also on a real chain: a sponsor with no DUST fails with Wallet.InsufficientFunds and leaves no trace in the pool.", size=12, color=TEAL, italic=True)

# =============================================================== SLIDE 9 ==
s = new_slide()
chrome(s, "EVIDENCE", "Real transactions, reproducible by anyone", 9)
steps = EVID["steps"]
y = Inches(1.85)
for x_, (h, w) in zip([MARGIN_L, MARGIN_L + Inches(4.2), MARGIN_L + Inches(5.6)], [("STEP", 4), ("BLOCK", 1.3), ("TRANSACTION", 6)]):
    t = textbox(s, x_ + Inches(0.15), y, Inches(3), Inches(0.3))
    set_text(t.text_frame, h, size=10, color=GRAY_DIM, bold=True)
hline(s, MARGIN_L, y + Inches(0.32), Inches(8.1))
y += Inches(0.42)
for st in steps:
    for x_, txt, f in [(MARGIN_L, st["step"], FONT), (MARGIN_L + Inches(4.2), st["blockHeight"], MONO), (MARGIN_L + Inches(5.6), short(st["txId"], 10), MONO)]:
        t = textbox(s, x_ + Inches(0.15), y + Inches(0.05), Inches(4), Inches(0.4))
        set_text(t.text_frame, txt, size=11.5, color=WHITE if f == FONT else TEAL, font=f)
    hline(s, MARGIN_L, y + Inches(0.5), Inches(8.1), color=LINE, weight=Pt(0.5))
    y += Inches(0.55)
t = textbox(s, MARGIN_L, y + Inches(0.1), Inches(8.1), Inches(0.9))
set_text(t.text_frame, f"Pool {short(EVID['poolAddress'], 10)} on a local devnet (node 0.22.3, indexer 4.0.0, proof-server 8.1.0). Reproduce: docker compose up, npm run compact, npm run flow.", size=11.5, color=GRAY, line_spacing=1.25)

stats = [("34", "contract tests"), ("20", "inspector tests"), ("8", "browser e2e checks"), ("1", "wave-1 control")]
sx = Inches(9.2)
sy = Inches(1.85)
for i, (num, lab) in enumerate(stats):
    col = i % 2
    row = i // 2
    left = sx + col * Inches(1.78)
    top = sy + row * Inches(1.65)
    rect(s, left, top, Inches(1.62), Inches(1.45), fill=PANEL, line_color=LINE, radius=0.08)
    t = textbox(s, left, top + Inches(0.2), Inches(1.62), Inches(0.7))
    set_text(t.text_frame, num, size=34, color=TEAL, bold=True, align=PP_ALIGN.CENTER)
    t = textbox(s, left, top + Inches(0.95), Inches(1.62), Inches(0.4))
    set_text(t.text_frame, lab, size=11, color=GRAY, align=PP_ALIGN.CENTER)
rect(s, sx, Inches(5.25), Inches(3.4), Inches(1.5), fill=PANEL, line_color=AMBER, line_w=Pt(1), radius=0.08)
t = textbox(s, sx + Inches(0.2), Inches(5.35), Inches(3.0), Inches(0.35))
set_text(t.text_frame, "NOT YET LIVE", size=11, color=AMBER, bold=True)
t = textbox(s, sx + Inches(0.2), Inches(5.7), Inches(3.0), Inches(1.0))
set_text(t.text_frame, "No Preprod or mainnet deployment yet. Everything above ran on a local devnet. We say so plainly.", size=11.5, color=GRAY, line_spacing=1.2)

# =============================================================== SLIDE 10 =
s = new_slide()
chrome(s, "THE CONSOLE", "Try to link a member. Try to break the pool.", 10)
pic(s, "console-linkability-lab.png", MARGIN_L, Inches(1.8), Inches(3.95), Inches(3.9))
pic(s, "console-attack-lab.png", MARGIN_L + Inches(4.2), Inches(1.8), Inches(3.95), Inches(3.9))
pic(s, "console-onchain.png", MARGIN_L + Inches(8.4), Inches(1.8), Inches(3.95), Inches(3.9))
for i, (h, b) in enumerate([
    ("Linkability lab", "Same member, both contracts. Search the public transcript for their commitment."),
    ("Attack lab", "Ten attacks on fresh pools. A pass means the circuit refused."),
    ("On-chain tab", "The devnet transactions, fees and byte-level check, read from the evidence file."),
]):
    left = MARGIN_L + i * Inches(4.2)
    t = textbox(s, left, Inches(5.95), Inches(4.0), Inches(0.35))
    set_text(t.text_frame, h, size=13, color=TEAL, bold=True)
    t = textbox(s, left, Inches(6.3), Inches(4.0), Inches(0.7))
    set_text(t.text_frame, b, size=11, color=GRAY, line_spacing=1.2)

# =============================================================== SLIDE 11 =
s = new_slide()
chrome(s, "WHY WAVE 1 NEVER DEPLOYED", "A silent version mismatch, found by comparing a working stack", 11)
cw = (CONTENT_W - Inches(0.4)) / 2
card(s, MARGIN_L, Inches(1.9), cw, Inches(2.5), "Wave 1 stack", (
    "node 1.0.0 · indexer 4.3.3 · proof-server 8.1.0\n\nProofs generated, wallet balanced, transaction submitted. Then nothing: no error, no block. The node dropped it silently."
), title_color=RED_SOFT, body_size=13)
card(s, MARGIN_L + cw + Inches(0.4), Inches(1.9), cw, Inches(2.5), "Wave 2 stack (pinned)", (
    "node 0.22.3 · indexer 4.0.0 · proof-server 8.1.0\n\nThe set the stable SDK line (midnight-js 4.1.1, ledger-v8 8.1.2) was validated against. Deploy lands in about 20 seconds."
), title_color=TEAL, body_size=13)
rect(s, MARGIN_L, Inches(4.65), CONTENT_W, Inches(2.0), fill=PANEL, line_color=LINE, radius=0.06)
t = textbox(s, MARGIN_L + Inches(0.3), Inches(4.8), CONTENT_W - Inches(0.6), Inches(0.4))
set_text(t.text_frame, "WHY THIS MATTERS TO OTHER BUILDERS", size=11, color=VIOLET, bold=True)
t = textbox(s, MARGIN_L + Inches(0.3), Inches(5.2), CONTENT_W - Inches(0.6), Inches(1.4))
add_multiline(t.text_frame, [
    "Newer node/indexer tags do not mean newer-is-better for the current SDK line. A mismatch fails silently, at submission.",
    "infra/devnet/standalone.yml pins the working set, with the reason written next to it, so the next team does not lose a wave to it.",
], size=13, color=WHITE, line_spacing=1.25, space_after=8)

# =============================================================== SLIDE 12 =
s = new_slide()
chrome(s, "WHO IT'S FOR, AND WHAT'S NEXT", "From a proven primitive to a service", 12)
cw = (CONTENT_W - Inches(0.4)) / 2
card(s, MARGIN_L, Inches(1.9), cw, Inches(2.45), "Who uses it", (
    "Wallets and dApps that must onboard users with zero balance.\nCommunities and DAOs sponsoring members without a membership list.\nAny app where \"who funded whom\" is itself sensitive."
), body_size=12.5)
card(s, MARGIN_L + cw + Inches(0.4), Inches(1.9), cw, Inches(2.45), "How it sustains", (
    "Sponsors pay fees they choose to cover; the on-chain budget caps exposure. A hosted reference sponsor service (pool-as-a-service) is the natural paid layer. The contract and inspector stay open."
), body_size=12.5)
rect(s, MARGIN_L, Inches(4.6), CONTENT_W, Inches(2.15), fill=PANEL, line_color=LINE, radius=0.06)
t = textbox(s, MARGIN_L + Inches(0.3), Inches(4.75), CONTENT_W - Inches(0.6), Inches(0.4))
set_text(t.text_frame, "WAVE 3", size=11, color=TEAL, bold=True)
add_multiline(textbox(s, MARGIN_L + Inches(0.3), Inches(5.15), CONTENT_W - Inches(0.6), Inches(1.5)).text_frame, [
    "Preprod deployment with the same script, and a funded wallet.",
    "Reference sponsor service as running code, with rate limits and per-pool budgets.",
    "Epoch-partitioned nullifiers so the spent set stops growing without bound.",
    "Browser wallet (DApp connector) so the console can drive a live pool, not just the sandbox.",
], size=13, color=WHITE, line_spacing=1.2, space_after=5)

out = os.path.join(HERE, "Sponsorship-Gate-Wave2-Pitch-Deck.pptx")
D.prs.save(out)
print("wrote", out, "slides:", len(D.prs.slides))
