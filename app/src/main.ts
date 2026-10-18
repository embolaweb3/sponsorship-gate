import "./style.css";
import { Pool, POW_PRESETS, explain, hex, short, randomBytes32, type PoolParams } from "./engine.ts";
import { inspectCandidate, type Verdict } from "../../integration/src/lib/sponsor-inspector.ts";

// ------------------------------------------------------------------ state ---

type Member = {
  id: number;
  name: string;
  secret: Uint8Array;
  nonce?: Uint8Array;
  attempts: number;
  mining: boolean;
  registered: boolean;
  receipts: { epoch: string; slot: string; nullifier: string }[];
};

type Tab = "overview" | "sponsor" | "member" | "observer" | "attacks" | "chain";
type Outcome = { ok: boolean; text: string };

const NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi"];

const S = {
  tab: "overview" as Tab,
  pool: undefined as Pool | undefined,
  params: { epochSeconds: 3600n, quota: 2n, budget: 6n, powTarget: 2_000_000n } as PoolParams,
  members: [] as Member[],
  sel: 0,
  busy: "" as string,
  enter: true,
  minMembers: 3,
  showPath: false,
  feePerTx: 0,
  activity: [] as { t: number; kind: string; text: string }[],
  attacks: {} as Record<string, Outcome>,
  inspector: {} as Record<string, Verdict>,
  lab: undefined as
    | undefined
    | {
        member: string;
        v1: { transcript: string; leaked: boolean; commitment: string };
        v2: { transcript: string; leaked: boolean; commitment: string };
      },
  evidence: undefined as any,
  evidenceLoaded: false
};

const $app = document.getElementById("app")!;
const $toast = document.getElementById("toast-root")!;
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const member = () => S.members[S.sel];
const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let toastTimer: number | undefined;

function note(kind: string, text: string) {
  S.activity.unshift({ t: Date.now(), kind, text });
  if (S.activity.length > 60) S.activity.pop();
}

function timeline(): string {
  if (!S.activity.length) return "";
  const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });
  return `<div class="card" style="margin-top:16px"><h2>Activity</h2><p class="muted small">Every event in this sandbox pool, newest first.</p><ul class="timeline">${S.activity.map((a) => `<li class="k-${a.kind}"><time>${fmt(a.t)}</time>${esc(a.text)}</li>`).join("")}</ul></div>`;
}

function say(ok: boolean, text: string) {
  render();
  $toast.innerHTML = `<div class="toast ${ok ? "good" : "bad"}">${esc(text)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ($toast.innerHTML = ""), 4500);
}

// ---------------------------------------------------------------- actions ---

async function deploy() {
  S.busy = "Deploying pool…";
  render();
  await sleep(20);
  S.pool = await Pool.deploy(S.params);
  S.activity = [];
  note("deploy", `Pool deployed: quota ${S.params.quota}/epoch, budget ${S.params.budget}, epoch ${S.params.epochSeconds}s`);
  S.members = [];
  S.sel = 0;
  S.lab = undefined;
  S.busy = "";
  say(true, "Pool deployed. Add members from the Member tab.");
}

function addMember(): Member {
  const id = S.members.length;
  note("member", `New member created (secret stays in this tab)`);
  const m: Member = { id, name: NAMES[id % NAMES.length] + (id >= NAMES.length ? ` ${Math.floor(id / NAMES.length) + 1}` : ""), secret: randomBytes32(), attempts: 0, mining: false, registered: false, receipts: [] };
  S.members.push(m);
  S.sel = id;
  return m;
}

async function mine(m: Member) {
  if (!S.pool || m.mining) return;
  m.mining = true;
  m.attempts = 0;
  render();
  let next = 0;
  while (true) {
    const r = S.pool.mine(m.secret, next, 4000);
    next = r.next;
    m.attempts = next;
    if (r.nonce) {
      m.nonce = r.nonce;
      break;
    }
    render();
    await sleep(0);
  }
  m.mining = false;
  render();
}

async function register(m: Member) {
  if (!S.pool || !m.nonce) return;
  try {
    await S.pool.register(m.secret, m.nonce);
    m.registered = true;
    note("register", `${m.name} registered (commitment added, no name attached)`);
    say(true, `${m.name} registered. The ledger now holds one more commitment, with no name attached.`);
  } catch (e) {
    note("warn", `Refused: ${explain(e).text}`);
    say(false, explain(e).text);
  }
}

async function authorize(m: Member, slot: bigint) {
  if (!S.pool) return;
  try {
    const n = await S.pool.authorize(m.secret, S.pool.epoch, slot);
    m.receipts.push({ epoch: String(S.pool.epoch), slot: String(slot), nullifier: hex(n) });
    note("authorize", `${m.name} authorized epoch ${S.pool.epoch} slot ${slot} → nullifier ${hex(n).slice(0, 10)}…`);
    say(true, `${m.name} authorized (epoch ${S.pool.epoch}, slot ${slot}). The sponsor can now balance one transaction.`);
  } catch (e) {
    note("warn", `Refused: ${explain(e).text}`);
    say(false, explain(e).text);
  }
}

function advanceEpoch() {
  if (!S.pool) return;
  const len = Number(S.pool.params.epochSeconds);
  S.pool.setTime((Number(S.pool.epoch) + 1) * len + 1);
  note("epoch", `Clock advanced to epoch ${S.pool.epoch}; quotas refreshed`);
  say(true, `Clock advanced to epoch ${S.pool.epoch}. Every member's quota has refreshed.`);
}

async function topUp() {
  if (!S.pool) return;
  const cur = S.pool.view().budget;
  try {
    await S.pool.topUp(cur + 5n);
    note("deploy", `Budget raised ${cur} → ${cur + 5n}`);
    say(true, `Budget raised to ${cur + 5n}.`);
  } catch (e) {
    say(false, explain(e).text);
  }
}

async function deactivate() {
  if (!S.pool) return;
  try {
    await S.pool.deactivate();
    note("warn", "Pool closed by owner");
    say(true, "Pool closed. No further registrations or authorizations are possible.");
  } catch (e) {
    say(false, explain(e).text);
  }
}

async function guidedDemo() {
  S.busy = "Running guided demo…";
  render();
  await sleep(20);
  S.params = { epochSeconds: 3600n, quota: 2n, budget: 6n, powTarget: 2_000_000n };
  S.pool = await Pool.deploy(S.params);
  S.activity = [];
  note("deploy", "Guided demo: pool deployed");
  S.members = [];
  for (let i = 0; i < 3; i++) {
    const m = addMember();
    let next = 0;
    for (;;) {
      const r = S.pool.mine(m.secret, next, 50_000);
      next = r.next;
      m.attempts = next;
      if (r.nonce) {
        m.nonce = r.nonce;
        break;
      }
    }
    await S.pool.register(m.secret, m.nonce!);
    m.registered = true;
    note("register", `${m.name} registered`);
    const n = await S.pool.authorize(m.secret, S.pool.epoch, 0n);
    m.receipts.push({ epoch: String(S.pool.epoch), slot: "0", nullifier: hex(n) });
    note("authorize", `${m.name} authorized epoch 0 slot 0`);
    await sleep(0);
  }
  S.sel = 0;
  await runPrivacyLab(true);
  S.busy = "";
  S.tab = "observer";
  say(true, "3 members registered and authorized. Now look at what an outside observer can (not) link.");
}

// ---------------------------------------------------------- privacy lab ----

async function freshPool(ver: "v1" | "v2", p: Partial<PoolParams> = {}) {
  return Pool.deploy({ epochSeconds: 3600n, quota: 2n, budget: 50n, powTarget: 16_777_216n, ...p }, ver);
}

async function runPrivacyLab(silent = false) {
  if (!silent) {
    S.busy = "Running the same flow on both contracts…";
    render();
    await sleep(20);
  }
  const secret = member()?.secret ?? randomBytes32();
  const name = member()?.name ?? "Alice";
  const run = async (ver: "v1" | "v2") => {
    const p = await freshPool(ver);
    await p.register(secret, new Uint8Array(32));
    const commitment = ver === "v2" ? p.commitmentOf(secret) : p.lastRegistered()!;
    await p.authorize(secret, 0n, 0n);
    const t = p.transcript();
    return { transcript: t.flat, leaked: t.contains(commitment), commitment: hex(commitment) };
  };
  S.lab = { member: name, v1: await run("v1"), v2: await run("v2") };
  if (!silent) {
    S.busy = "";
    render();
  }
}

// ---------------------------------------------------------- attack lab -----

type Attack = { id: string; title: string; story: string; expect: string; run: () => Promise<Outcome> };

const refuse = async (fn: () => Promise<unknown>, expectCode: string): Promise<Outcome> => {
  try {
    await fn();
    return { ok: false, text: "UNEXPECTED: the attack succeeded" };
  } catch (e) {
    const x = explain(e);
    return { ok: x.code === expectCode, text: `${x.code} — ${x.text}` };
  }
};

const ATTACKS: Attack[] = [
  {
    id: "replay",
    title: "Replay an authorization",
    story: "A member tries to draw a second sponsored action from a slot they already used this epoch.",
    expect: "already authorized this epoch",
    run: async () => {
      const s = randomBytes32(), p = await freshPool("v2", { quota: 1n });
      await p.register(s, new Uint8Array(32));
      await p.authorize(s, 0n, 0n);
      return refuse(() => p.authorize(s, 0n, 0n), "already authorized this epoch");
    }
  },
  {
    id: "outsider",
    title: "Authorize without registering",
    story: "Someone who never paid the proof-of-work tries to get sponsored in a pool with other members.",
    expect: "not registered",
    run: async () => {
      const p = await freshPool("v2");
      await p.register(randomBytes32(), new Uint8Array(32));
      return refuse(() => p.authorize(randomBytes32(), 0n, 0n), "not registered");
    }
  },
  {
    id: "quota",
    title: "Exceed the per-epoch quota",
    story: "The pool grants 1 authorization per epoch. The member asks for slot 1 to get a second.",
    expect: "slot exceeds epoch quota",
    run: async () => {
      const s = randomBytes32(), p = await freshPool("v2", { quota: 1n });
      await p.register(s, new Uint8Array(32));
      return refuse(() => p.authorize(s, 0n, 1n), "slot exceeds epoch quota");
    }
  },
  {
    id: "pow",
    title: "Skip the proof-of-work",
    story: "A bot tries to register with a made-up nonce against a hard difficulty target.",
    expect: "pow requirement not met",
    run: async () => {
      const p = await freshPool("v2", { powTarget: 4096n });
      return refuse(() => p.register(randomBytes32(), new Uint8Array(32)), "pow requirement not met");
    }
  },
  {
    id: "sybil",
    title: "Register the same secret twice",
    story: "A member registers again hoping for a second set of quota.",
    expect: "already registered",
    run: async () => {
      const s = randomBytes32(), p = await freshPool("v2");
      await p.register(s, new Uint8Array(32));
      return refuse(() => p.register(s, new Uint8Array(32)), "already registered");
    }
  },
  {
    id: "epoch",
    title: "Authorize for a future epoch",
    story: "A member pre-draws quota for epoch 5 while the chain is still in epoch 0.",
    expect: "epoch out of range for current block time",
    run: async () => {
      const s = randomBytes32(), p = await freshPool("v2");
      await p.register(s, new Uint8Array(32));
      return refuse(() => p.authorize(s, 5n, 0n), "epoch out of range for current block time");
    }
  },
  {
    id: "drain",
    title: "Drain the sponsor's budget",
    story: "Three members each draw one authorization from a pool whose on-chain budget is 2.",
    expect: "pool budget exhausted",
    run: async () => {
      const p = await freshPool("v2", { budget: 2n });
      const ss = [randomBytes32(), randomBytes32(), randomBytes32()];
      for (const s of ss) await p.register(s, new Uint8Array(32));
      await p.authorize(ss[0], 0n, 0n);
      await p.authorize(ss[1], 0n, 0n);
      return refuse(() => p.authorize(ss[2], 0n, 0n), "pool budget exhausted");
    }
  },
  {
    id: "takeover",
    title: "Non-owner raises the budget",
    story: "A member tries to call topUp with a key that isn't the owner's.",
    expect: "not pool owner",
    run: async () => {
      const p = await freshPool("v2");
      return refuse(() => p.topUp(1_000n, false), "not pool owner");
    }
  },
  {
    id: "lower",
    title: "Lower the budget after the fact",
    story: "Even the owner can't shrink a budget that members were promised; only raise it or close the pool.",
    expect: "budget can only increase",
    run: async () => {
      const p = await freshPool("v2", { budget: 10n });
      return refuse(() => p.topUp(3n), "budget can only increase");
    }
  },
  {
    id: "closed",
    title: "Use a closed pool",
    story: "After the sponsor closes the pool, a registered member tries to authorize.",
    expect: "pool not active",
    run: async () => {
      const s = randomBytes32(), p = await freshPool("v2");
      await p.register(s, new Uint8Array(32));
      await p.deactivate();
      return refuse(() => p.authorize(s, 0n, 0n), "pool not active");
    }
  }
];

// Sponsor-side inspection. Candidates are shaped like ledger transactions
// (intents -> actions -> call{address, entryPoint, transcripts}); the real
// devnet run applies this same function to genuine proven transactions.
const POOL_ADDR = "a".repeat(64);
const call = (entry: string, address = POOL_ADDR, transcript: unknown = []) => ({ address, entryPoint: entry, guaranteedTranscript: transcript, fallibleTranscript: undefined });
const intent = (...actions: object[]) => ({ intents: new Map([[1, { actions }]]), guaranteedOffer: undefined, fallibleOffer: undefined });
class ContractDeploy {}
class MaintenanceUpdate {}

const SPENT = "ab".repeat(32);
const CANDIDATES: { id: string; title: string; story: string; tx: () => any }[] = [
  { id: "ok-reg", title: "Honest register", story: "One register call on the sponsor's pool.", tx: () => intent(call("register")) },
  { id: "ok-auth", title: "Honest authorize", story: "One authorize call, fresh nullifier. Subject to the minimum anonymity set.", tx: () => intent(call("authorize", POOL_ADDR, [new Uint8Array(32).fill(1)])) },
  { id: "bad-deploy", title: "Smuggled contract deploy", story: "The sponsee attaches a deployment so the sponsor pays for their own contract.", tx: () => intent(call("authorize"), new ContractDeploy()) },
  { id: "bad-maint", title: "Smuggled maintenance update", story: "A maintenance update to rewrite someone's verifier keys, paid by the sponsor.", tx: () => intent(new MaintenanceUpdate()) },
  { id: "bad-other", title: "Call to a different contract", story: "A valid-looking call that targets some other contract entirely.", tx: () => intent(call("authorize", "b".repeat(64))) },
  { id: "bad-bundle", title: "Bundle of many calls", story: "Five authorize calls in one transaction to inflate the sponsored fee.", tx: () => intent(call("authorize"), call("authorize"), call("authorize"), call("authorize"), call("authorize")) },
  { id: "bad-owner", title: "Owner-only entry point", story: "A topUp call: legitimate for the owner, never something the sponsor pays a stranger for.", tx: () => intent(call("topUp")) },
  { id: "bad-shielded", title: "Shielded value movement", story: "A candidate that also moves shielded coins; a sponsor pays fees, not transfers.", tx: () => ({ ...intent(call("authorize")), guaranteedOffer: {} }) },
  { id: "bad-replay", title: "Replayed nullifier", story: "An authorize whose nullifier is already in the pool's spent set.", tx: () => intent(call("authorize", POOL_ADDR, [new Uint8Array(32).fill(0xab)])) }
];

function runInspector() {
  S.inspector = {};
  for (const c of CANDIDATES) {
    S.inspector[c.id] = inspectCandidate(c.tx(), { poolAddress: POOL_ADDR, spentNullifiersHex: new Set([SPENT]), minMembers: S.minMembers, memberCount: S.pool ? S.pool.view().registered.length : 0 });
  }
  render();
}

async function runAttack(a: Attack) {
  S.attacks[a.id] = { ok: true, text: "running…" };
  render();
  await sleep(10);
  S.attacks[a.id] = await a.run();
  render();
}

async function runAllAttacks() {
  for (const a of ATTACKS) await runAttack(a);
  runInspector();
}

/** 8-leaf illustration of the pool's Merkle tree (the real tree is depth 10). */
function merkleSvg(n: number, mine: number | null, showPath: boolean): string {
  const W = 560, H = 250, L = 8;
  const xs = (lvl: number, i: number) => { const cnt = L >> lvl; return (W / cnt) * (i + 0.5); };
  const ys = [215, 150, 85, 25];
  const onPath = (lvl: number, i: number) => showPath && mine !== null && mine < L && (mine >> lvl) === i;
  let edges = "", nodes = "";
  for (let lvl = 0; lvl <= 3; lvl++) {
    const cnt = L >> lvl;
    for (let i = 0; i < cnt; i++) {
      const x = xs(lvl, i), y = ys[lvl];
      const filled = lvl === 0 ? i < n : (i << lvl) < n;
      const p = onPath(lvl, i);
      if (lvl > 0) for (const c of [2 * i, 2 * i + 1]) {
        const cp = onPath(lvl - 1, c) && p;
        edges += `<g class="${cp ? "path" : ""}"><path class="edge" pathLength="100" d="M${xs(lvl - 1, c)} ${ys[lvl - 1] - 12} L${x} ${y + 12}"/></g>`;
      }
      const cls = lvl === 3 ? "node root" : filled ? "node" : "node empty";
      const label = lvl === 0 ? (p ? "you" : filled ? "m" + (i + 1) : "") : lvl === 3 ? "root" : "";
      nodes += `<g class="${p ? "path" : ""}"><circle class="${cls}" cx="${x}" cy="${y}" r="${lvl === 3 ? 16 : 12}"/><text class="lab" x="${x}" y="${y + 4}">${label}</text></g>`;
    }
  }
  const more = n > L ? `<text x="${W - 40}" y="245">+${n - L} more leaves</text>` : "";
  return `<svg class="tree" viewBox="0 0 ${W} ${H}" role="img" aria-label="Merkle tree with ${n} members">${edges}${nodes}${more}</svg>`;
}

/** Sponsor exposure estimate. Fee defaults to the mean measured on the devnet run. */
function runway(v: ReturnType<Pool["view"]>): string {
  const measured = (S.evidence?.sponsoredTxs ?? []).map((t: any) => Number(t.fee));
  const mean = measured.length ? Math.round(measured.reduce((a: number, b: number) => a + b, 0) / measured.length) : 0;
  const fee = S.feePerTx || mean;
  const left = Number(v.budget - v.used);
  const perEpochMax = Math.min(left, v.registered.length * Number(v.quota));
  const fmt = (n: number) => n.toLocaleString("en-US");
  const epochs = perEpochMax > 0 ? Math.ceil(left / perEpochMax) : 0;
  return `<div class="stack"><div><h3>Runway</h3><p class="muted small" style="margin:0">Worst case if every member uses every slot, every epoch.</p></div>
  <div><label for="f-fee">Fee per sponsored tx (smallest DUST unit)</label><input id="f-fee" type="number" min="0" value="${fee}" />
  <div class="small muted" style="margin-top:4px">${mean ? `Default is the mean of ${measured.length} real devnet transactions.` : "No devnet evidence loaded; enter an estimate."}</div></div>
  <div class="grid g3"><div class="stat"><b data-count="left" data-to="${left}">${left}</b><span>authorizations left</span></div>
  <div class="stat"><b data-count="pem" data-to="${perEpochMax}">${perEpochMax}</b><span>max per epoch</span></div>
  <div class="stat"><b>${epochs || "—"}</b><span>epochs of runway</span></div></div>
  <div class="result info small">Max remaining spend: <b>${fmt(left * fee)}</b> units. Max per epoch: <b>${fmt(perEpochMax * fee)}</b> units. The budget ceiling makes this a hard bound, not a forecast.</div></div>`;
}

function anonMeter(n: number, min: number): string {
  const pct = Math.min(100, Math.round((n / Math.max(1, min)) * 100));
  const ok = n >= min;
  return `<div class="anon"><div class="row between small"><b>Anonymity set</b><span class="pill ${ok ? "good" : "warn"}">${n} of ${min} needed</span></div><div class="meter ${ok ? "" : "hot"}"><i data-meter="anon" data-to="${pct}" style="width:${pct}%"></i></div><p class="small muted" style="margin:6px 0 0">${n === 0 ? "No members yet." : n === 1 ? "One member: the sponsor can tell who is authorizing. Nothing is hidden." : ok ? `A member is indistinguishable among ${n}.` : `Below the minimum: the sponsor will not pay for authorizations yet, but still sponsors registrations so the pool can grow.`}</p></div>`;
}

/** The distinct byte-strings an observer can read in a call's public transcript,
 * with the member's commitment highlighted wherever it appears. */
function transcriptValues(flat: string, commitment: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of flat.split("|")) {
    if (!/^[0-9a-f]{32,}$/.test(tok) || seen.has(tok)) continue;
    seen.add(tok);
    const i = tok.indexOf(commitment);
    if (i >= 0) out.push(`<mark class="leak">${esc(tok.length > 80 ? tok.slice(Math.max(0, i - 8), i + commitment.length + 8) : tok)}</mark> <span class="small">← member commitment</span>`);
    else out.push(esc(tok.length > 96 ? tok.slice(0, 40) + "…" + tok.slice(-24) : tok));
  }
  return out.length ? out.map((o, i) => `${i + 1}. ${o}`).join("<br>") : "(no byte values)";
}

// ------------------------------------------------------------------ views ---

const view = {
  overview(): string {
    return `
    <section class="hero">
      <span class="pill good">Midnight · Compact · Wave 2</span>
      <h1>Sponsor a stranger's transaction.<br />Never learn who they are.</h1>
      <p class="lead">A sponsor funds a pool. Members prove they did real work once, then draw a limited number of sponsored actions per epoch, with zero-knowledge membership and nullifiers, so no one (including the sponsor) can link a request to a person, or to the member's other requests.</p>
      <div class="row">
        <button class="btn primary" data-act="demo" ${S.busy ? "disabled" : ""}>▶ Run the guided demo</button>
        <button class="btn" data-go="sponsor">Set up a pool yourself</button>
        <button class="btn" data-go="attacks">Try to break it</button>
      </div>
      <p class="muted small" style="margin-top:14px">Everything below runs the <b>real compiled Compact circuits</b> in your browser. No wallet, no Docker, no server.</p>
    </section>

    <section class="steps" style="margin:26px 0">
      <div class="step"><b>Register once</b><span class="muted">Solve a small proof-of-work bound to your secret. Your commitment joins a Merkle tree. Cost to a bot; free to a person.</span></div>
      <div class="step"><b>Authorize per epoch</b><span class="muted">Prove "I'm in the tree" without saying where. Spend a nullifier for (epoch, slot). One use each.</span></div>
      <div class="step"><b>Sponsor pays</b><span class="muted">The sponsor inspects the exact transaction, then balances it with its own DUST. The member never needs one.</span></div>
    </section>

    <section class="grid g2">
      <div class="card">
        <h2>What changed in Wave 2</h2>
        <div class="stack small">
          <div><span class="pill bad">found</span> Wave 1's <code>authorize</code> published the caller's commitment in the public transcript, linking every request a member ever made. Wave 1's 16 tests could not see it.</div>
          <div><span class="pill good">fixed</span> Membership is now a Merkle proof. Only the root is disclosed. A transcript-level regression test and a wave-1 control prove the leak is gone.</div>
          <div><span class="pill good">new</span> Per-epoch quota slots, an on-chain budget ceiling the sponsor can only raise, owner top-up.</div>
          <div><span class="pill good">new</span> A real two-party flow on a local devnet: an unfunded wallet's transactions, paid by the sponsor after inspection.</div>
          <div><span class="pill good">new</span> This console, and a sponsor-side inspector that refuses smuggled deploys, bundles and foreign calls.</div>
        </div>
      </div>
      <div class="card">
        <h2>Why Midnight, specifically</h2>
        <div class="stack small">
          <p><b>DUST is shielded and separate from NIGHT.</b> Fee capacity is a protocol resource, so "who paid for this" isn't a field every observer reads, unlike an ERC-4337 <code>paymasterAndData</code>.</p>
          <p><b>Third-party balancing is a wallet primitive.</b> A sponsor's wallet can fee-balance a transaction it didn't build. No paymaster contract needed.</p>
          <p><b><code>disclose()</code> is enforced by the compiler.</b> The leak above was a ledger <em>query</em>, not a state write, which is exactly the kind of thing worth testing at the transcript level.</p>
        </div>
      </div>
    </section>`;
  },

  sponsor(): string {
    const p = S.pool;
    const v = p?.view();
    const preset = POW_PRESETS.find((x) => x.target === S.params.powTarget)?.id ?? "easy";
    return `
    <div class="grid g2">
      <div class="card stack">
        <div><h2>1 · Create a pool</h2><p class="muted small">You're the sponsor and owner. These are fixed at deploy time, except the budget, which you can only raise.</p></div>
        <div class="fields">
          <div><label for="f-epoch">Epoch length</label><select id="f-epoch">${[[60n, "1 minute"], [3600n, "1 hour"], [86400n, "1 day"]].map(([s, l]) => `<option value="${s}" ${S.params.epochSeconds === s ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div><label for="f-quota">Quota / member / epoch</label><input id="f-quota" type="number" min="1" max="10" value="${S.params.quota}" /></div>
          <div><label for="f-budget">Total budget</label><input id="f-budget" type="number" min="1" max="1000" value="${S.params.budget}" /></div>
          <div><label for="f-pow">Sybil cost (PoW)</label><select id="f-pow">${POW_PRESETS.map((x) => `<option value="${x.id}" ${x.id === preset ? "selected" : ""}>${x.label}</option>`).join("")}</select></div>
        </div>
        <div class="row"><button class="btn primary" data-act="deploy" ${S.busy ? "disabled" : ""}>${p ? "Redeploy pool" : "Deploy pool"}</button>
        ${p ? `<span class="pill good">live · <span class="mono">${short(p.address, 6)}</span></span>` : `<span class="pill">not deployed</span>`}</div>
      </div>

      <div class="card stack">
        <div><h2>2 · Watch the budget</h2><p class="muted small">The contract can't read your DUST. Instead you commit to a ceiling on-chain, and it stops granting when it's reached.</p></div>
        ${
          v
            ? `<div class="stat"><b><span data-count="used" data-to="${v.used}">${v.used}</span> <span style="font-size:15px;text-transform:none;letter-spacing:0">of ${v.budget}</span></b><span>authorizations granted</span></div>
          <div class="meter ${v.budget > 0n && v.used * 10n >= v.budget * 8n ? "hot" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="${v.budget}" aria-valuenow="${v.used}"><i data-meter="budget" data-to="${v.budget > 0n ? Math.min(100, Number((v.used * 100n) / v.budget)) : 0}" style="width:${v.budget > 0n ? Math.min(100, Number((v.used * 100n) / v.budget)) : 0}%"></i></div>
          <div class="row"><span class="pill ${v.active ? "good" : "bad"}">${v.active ? "open" : "closed"}</span><span class="pill">${v.registered.length} members</span><span class="pill">quota ${v.quota}/epoch</span></div>
          ${anonMeter(v.registered.length, S.minMembers)}
          <div><label for="f-min">Minimum anonymity set (sponsor policy)</label><input id="f-min" type="number" min="1" max="50" value="${S.minMembers}" /></div>
          <div class="row"><button class="btn" data-act="topup">Raise budget +5</button><button class="btn danger" data-act="close" ${v.active ? "" : "disabled"}>Close pool</button></div>`
            : `<p class="muted">Deploy a pool to see its budget.</p>`
        }
      </div>
    </div>

    ${v ? `<div class="card" style="margin-top:16px">${runway(v)}</div>` : ""}
    <div class="card" style="margin-top:16px">
      <div class="row between"><div><h2>3 · The sponsor's inspector</h2><p class="muted small" style="margin:0">Before spending DUST, the sponsor inspects the <em>exact</em> candidate transaction. Same function the devnet sponsor service runs.</p></div><button class="btn" data-act="inspect">Run all candidates</button></div>
      <table style="margin-top:12px"><thead><tr><th>Candidate</th><th>Verdict</th></tr></thead><tbody>
      ${CANDIDATES.map((c) => {
        const r = S.inspector[c.id];
        return `<tr><td><b>${c.title}</b><div class="muted small">${c.story}</div></td><td>${r ? (r.ok ? `<span class="pill good">balance it</span><div class="small muted mono" style="margin-top:4px">${esc(r.entryPoint)}</div>` : `<span class="pill bad">refuse</span><div class="small mono" style="margin-top:4px">${r.code}</div>`) : `<span class="muted">—</span>`}</td></tr>`;
      }).join("")}
      </tbody></table>
    </div>${timeline()}`;
  },

  member(): string {
    const p = S.pool;
    if (!p) return `<div class="card"><h2>No pool yet</h2><p class="muted">Deploy a pool from the Sponsor tab, or run the guided demo.</p><div class="row"><button class="btn primary" data-act="demo">▶ Run the guided demo</button><button class="btn" data-go="sponsor">Go to Sponsor</button></div></div>`;
    const v = p.view();
    const m = member();
    const target = p.params.powTarget;
    return `
    <div class="grid g2">
      <div class="card stack">
        <div class="row between"><h2>Members</h2><button class="btn sm" data-act="addmember">+ New member</button></div>
        <p class="muted small">Each member's secret is generated here and never leaves this page. The pool never sees it.</p>
        ${S.members.length ? `<div class="row">${S.members.map((x, i) => `<button class="btn sm ${i === S.sel ? "primary" : ""}" data-act="pick" data-i="${i}">${esc(x.name)} ${x.registered ? "✓" : ""}</button>`).join("")}</div>` : `<p class="muted">No members yet.</p>`}
        <hr style="border:0;border-top:1px solid var(--line);width:100%" />
        <div class="row between small"><span class="muted">Epoch</span><b>${p.epoch}</b></div>
        <div class="row between small"><span class="muted">Quota left this epoch (pool-wide budget ${v.used}/${v.budget})</span><b>${m ? Math.max(0, Number(v.quota) - m.receipts.filter((r) => r.epoch === String(p.epoch)).length) : "—"} / ${v.quota}</b></div>
        <button class="btn" data-act="epoch">Advance clock to next epoch →</button>
      </div>

      <div class="card stack">
        ${
          m
            ? `<h2>${esc(m.name)}</h2>
          <div class="small"><span class="muted">secret</span> <span class="hash">${short(hex(m.secret), 6)}</span> <span class="pill">private · in memory</span></div>
          <div class="stack">
            <div><b>① Proof-of-work</b> <span class="muted small">~${Math.round(16_777_216 / Number(target))} tries expected</span></div>
            <div class="row"><button class="btn" data-act="mine" ${m.mining || m.nonce || !v.active ? "disabled" : ""}>${m.mining ? `<span class="spinner"></span> mining…` : m.nonce ? "✓ solved" : "Mine nonce"}</button><span class="small muted">${m.attempts ? `${m.attempts.toLocaleString()} attempts` : ""}</span></div>
            <div><b>② Register</b> <span class="muted small">adds your commitment to the pool</span></div>
            <button class="btn primary" data-act="register" ${!m.nonce || m.registered || !v.active ? "disabled" : ""}>${m.registered ? "✓ registered" : "Register"}</button>
            <div><b>③ Authorize</b> <span class="muted small">pick a slot (0 … ${Number(v.quota) - 1})</span></div>
            <div class="row">${Array.from({ length: Number(v.quota) }, (_, i) => `<button class="btn" data-act="auth" data-slot="${i}" ${!m.registered || !v.active ? "disabled" : ""}>Slot ${i}</button>`).join("")}</div>
          </div>
          ${m.receipts.length ? `<div><h3>Receipts</h3><table><thead><tr><th>Epoch</th><th>Slot</th><th>Nullifier</th></tr></thead><tbody>${m.receipts.map((r) => `<tr><td>${r.epoch}</td><td>${r.slot}</td><td class="hash">${short(r.nullifier, 8)}</td></tr>`).join("")}</tbody></table></div>` : ""}`
            : `<h2>Add a member</h2><p class="muted">Create a member to go through register → authorize.</p><button class="btn primary" data-act="addmember">+ New member</button>`
        }
      </div>
    </div>${timeline()}`;
  },

  observer(): string {
    const p = S.pool;
    if (!p) return `<div class="card"><h2>Nothing to observe yet</h2><p class="muted">Run the guided demo to populate a pool.</p><button class="btn primary" data-act="demo">▶ Run the guided demo</button></div>`;
    const v = p.view();
    const lab = S.lab;
    const hl = (t: string, c: string) => transcriptValues(t, c);
    return `
    <div class="card" style="margin-bottom:16px">
      <h2>What the public ledger shows</h2>
      <div class="row between"><p class="muted small" style="margin:0">This is everything an indexer, the sponsor, or any stranger can read. Note what's missing: names, secrets, and any edge between a commitment and a nullifier.</p><button class="btn sm" data-act="export">Download snapshot (JSON)</button></div>
      <div class="grid g3" style="margin-top:12px">
        <div class="card tight"><div class="stat"><b data-count="commit" data-to="${v.registered.length}">${v.registered.length}</b><span>commitments</span></div></div>
        <div class="card tight"><div class="stat"><b data-count="null" data-to="${v.nullifiers.length}">${v.nullifiers.length}</b><span>nullifiers spent</span></div></div>
        <div class="card tight"><div class="stat"><b class="hash" style="font-size:13px">${v.root !== undefined ? short(v.root.toString(16).padStart(64, "0"), 8) : "—"}</b><span>merkle root</span></div></div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div><h3>Registered commitments <span class="muted small">· click to copy</span></h3><div class="tx">${v.registered.map((c, i) => `<button class="copy" data-copy="${hex(c)}" title="Copy full commitment">${i + 1}. ${short(hex(c), 14)}</button>`).join("") || "—"}</div></div>
        <div><h3>Spent nullifiers</h3><div class="tx">${v.nullifiers.map((c, i) => `<button class="copy" data-copy="${hex(c)}" title="Copy full nullifier">${i + 1}. ${short(hex(c), 14)}</button>`).join("") || "—"}</div></div>
      </div>
      <div style="margin-top:14px">${anonMeter(v.registered.length, S.minMembers)}</div>
      <p class="small muted" style="margin-top:10px">Try to match a nullifier to a commitment. There is no information to do it with: the nullifier is a hash of (pool, epoch, slot, <em>secret</em>), and the secret is never published.</p>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="row between"><div><h2>The membership tree</h2><p class="muted small" style="margin:0">Only the <b>root</b> is ever disclosed by <code>authorize</code>. Your path to it stays private.</p></div>
      <button class="btn sm" data-act="path">${S.showPath ? "Hide" : "Reveal"} ${esc(member()?.name ?? "a member")}'s private path</button></div>
      ${merkleSvg(v.registered.length, member() ? p.leafIndex(member()!.secret) : null, S.showPath)}
      <p class="small muted" style="margin:0">Illustration shows 8 leaves; the deployed tree has 1,024. ${S.showPath ? "Highlighted: the private witness path. The circuit hashes it to the root inside the proof; observers only see the root." : ""}</p>
    </div>

    <div class="card">
      <div class="row between"><div><h2>Linkability lab: Wave 1 vs Wave 2</h2><p class="muted small" style="margin:0">Same member, same flow, run on both contracts. Then search the public transcript of <code>authorize</code> for that member's commitment.</p></div>
      <button class="btn primary" data-act="lab" ${S.busy ? "disabled" : ""}>Run on ${esc(member()?.name ?? "a new member")}</button></div>
      ${
        lab
          ? `<div class="vs" style="margin-top:14px">
          <div class="stack"><div class="row"><span class="pill bad">Wave 1 contract</span>${lab.v1.leaked ? `<span class="pill bad">commitment FOUND in transcript</span>` : `<span class="pill good">not found</span>`}</div>
            <div class="tx">${hl(lab.v1.transcript, lab.v1.commitment)}</div>
            <div class="result no small">The commitment is public on every <code>authorize</code>. Anyone can group all of ${esc(lab.member)}'s requests by it.</div></div>
          <div class="stack"><div class="row"><span class="pill good">Wave 2 contract</span>${lab.v2.leaked ? `<span class="pill bad">commitment FOUND</span>` : `<span class="pill good">commitment NOT in transcript</span>`}</div>
            <div class="tx">${hl(lab.v2.transcript, lab.v2.commitment)}</div>
            <div class="result ok small">Only a Merkle root and a fresh nullifier are disclosed. The member is one of ${v.registered.length || "N"}, indistinguishable.</div></div>
        </div>`
          : `<p class="muted" style="margin-top:12px">Run it to see the difference.</p>`
      }
    </div>${timeline()}`;
  },

  attacks(): string {
    return `
    <div class="card">
      <div class="row between"><div><h2>Attack lab</h2><p class="muted small" style="margin:0">Each button builds a fresh pool and tries to cheat it. A "pass" means the <em>circuit refused</em>, so no proof exists and no transaction is made.</p></div>
      <button class="btn primary" data-act="allattacks">Run all</button></div>
      <div style="margin-top:8px">
      ${ATTACKS.map((a) => {
        const r = S.attacks[a.id];
        return `<div class="attack">
          <div><b>${a.title}</b><div class="muted small">${a.story}</div><div class="small" style="margin-top:2px">expects: <span class="kbd">${a.expect}</span></div></div>
          <button class="btn sm" data-act="attack" data-id="${a.id}">Run</button>
          ${r ? `<div class="out result ${r.text === "running…" ? "info" : r.ok ? "ok" : "no"}">${r.text === "running…" ? `<span class="spinner"></span> running…` : (r.ok ? "✓ refused: " : "✗ ") + esc(r.text)}</div>` : ""}
        </div>`;
      }).join("")}
      </div>
    </div>`;
  },

  chain(): string {
    const e = S.evidence;
    return `
    <div class="grid g2">
      <div class="card stack">
        <h2>Real devnet evidence</h2>
        <p class="muted small">Produced by <span class="kbd">integration/src/sponsored-flow.ts</span> against a local Midnight node, indexer and proof server. Every number below is read from <span class="kbd">evidence-local.json</span>, written by that run.</p>
        ${
          e
            ? `<table><tbody>
          <tr><td class="muted">Network</td><td>${esc(e.network)}</td></tr>
          <tr><td class="muted">Pool contract</td><td class="hash">${esc(e.poolAddress)}</td></tr>
          <tr><td class="muted">Deploy tx</td><td class="hash">${esc(e.deployTx)}</td></tr>
          <tr><td class="muted">Sponsored register tx</td><td class="hash">${esc(e.registerTx)}</td></tr>
          <tr><td class="muted">Nullifiers</td><td class="hash">${(e.nullifiers ?? []).map(esc).join("<br>")}</td></tr>
          <tr><td class="muted">Fees paid by sponsor</td><td>${esc(e.sponsorFeesPaid)} DUST over ${(e.sponsoredTxs ?? []).length} txs</td></tr>
          <tr><td class="muted">Fees paid by sponsee</td><td>${esc(e.sponseeFeesPaid)} (no NIGHT, no DUST, no wallet)</td></tr>
          <tr><td class="muted">Commitment in tx bytes</td><td>${(e.onChainPrivacyCheck ?? []).map((c: any) => `${esc(c.entry)}: <b>${c.containsCommitment ? "yes" : "no"}</b>`).join("<br>")}<div class="muted small">register is the positive control; authorize must be "no"</div></td></tr>
          <tr><td class="muted">Observer view</td><td>${esc(JSON.stringify(e.observerView))}</td></tr>
          </tbody></table>
          <h3>Transactions</h3>
          <table><thead><tr><th>Step</th><th>Block</th><th>Tx</th></tr></thead><tbody>${(e.steps ?? []).map((x: any) => `<tr><td>${esc(x.step)}</td><td>${esc(x.blockHeight)}</td><td class="hash">${short(esc(x.txId), 10)}</td></tr>`).join("")}</tbody></table>
          <h3>Abuse attempts against the real chain</h3>
          <div class="tx">${(e.abuseAttempts ?? []).map((x: any) => `${x.refused ? "✓ refused" : "✗ NOT refused"}: ${esc(x.attempt)}<br>&nbsp;&nbsp;→ ${esc(x.message)}`).join("<br>")}</div>
          <h3>Sponsor decisions</h3>
          <div class="tx">${(e.sponsorDecisions ?? []).map((d: Verdict) => (d.ok ? `✓ balance (${esc(d.entryPoint)})` : `✗ refuse ${esc(d.code)}`)).join("<br>")}</div>`
            : S.evidenceLoaded
              ? `<div class="result info">No evidence file shipped with this build. Run <span class="kbd">npm run flow</span> in <span class="kbd">integration/</span> to generate one.</div>`
              : `<span class="spinner"></span>`
        }
      </div>
      <div class="card stack">
        <h2>Reproduce it</h2>
        <div class="tx">docker compose -f infra/devnet/standalone.yml \\<br>&nbsp;&nbsp;--env-file infra/devnet/standalone.env up -d<br><br>cd contract &amp;&amp; npm i &amp;&amp; npm test<br>cd ../integration &amp;&amp; npm i &amp;&amp; npm run compact<br>npm run flow</div>
        <p class="small muted"><b>Version pinning matters.</b> Wave 1's deployment hung because the node (1.0.0) and indexer (4.3.3) were newer than the ledger the SDK speaks; the node dropped transactions silently. Pinned: node 0.22.3 · indexer 4.0.0 · proof-server 8.1.0.</p>
        <p class="small muted"><b>What is and isn't live:</b> contract + sponsor flow are verified on a local devnet. Preprod needs a funded wallet; the same script runs with <span class="kbd">TARGET=preprod</span>.</p>
      </div>
    </div>`;
  }
};

// ------------------------------------------------------------------ shell ---

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "sponsor", label: "Sponsor" },
  { id: "member", label: "Member" },
  { id: "observer", label: "Observer" },
  { id: "attacks", label: "Attack lab" },
  { id: "chain", label: "On-chain" }
];

function render() {
  const p = S.pool;
  $app.innerHTML = `
  <header class="top"><div class="wrap bar">
    <div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0b1020"/><path d="M9 22V14a7 7 0 0 1 14 0v8" fill="none" stroke="#7c9cff" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="20" r="2.5" fill="#00d4a8"/></svg>Sponsorship Gate</div>
    <nav class="tabs" role="tablist" aria-label="Sections">${TABS.map((t) => `<button role="tab" aria-selected="${S.tab === t.id}" data-go="${t.id}">${t.label}</button>`).join("")}</nav>
    <div class="clock">${p ? `<span class="pill">epoch ${p.epoch}</span>` : ""}<span class="pill ${S.busy ? "warn" : "good"}">${S.busy ? esc(S.busy) : "sandbox · real circuits"}</span></div>
  </div></header>
  <main><div class="wrap ${S.enter ? "enter" : ""}">${view[S.tab]()}</div></main>
  <div class="wrap"><footer>Apache-2.0 · Midnight Buildathon Wave 2 · Sandbox runs the compiled <span class="mono">sponsorship-gate.compact</span>; the On-chain tab shows the devnet run.</footer></div>
`;
  S.enter = false;
  postRender();
}

const shown = new Map<string, number>();
/** Animate numbers and meters from their last shown value to the new one. */
function postRender() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const key = el.dataset.count!, to = Number(el.dataset.to), from = shown.get(key) ?? 0;
    shown.set(key, to);
    if (from === to) return;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  document.querySelectorAll<HTMLElement>("[data-meter]").forEach((el) => {
    const key = "m:" + el.dataset.meter, to = Number(el.dataset.to), from = shown.get(key) ?? 0;
    shown.set(key, to);
    el.style.width = from + "%";
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.width = to + "%")));
  });
}

function exportSnapshot() {
  if (!S.pool) return;
  const v = S.pool.view();
  const snap = {
    note: "Public ledger view of a Sponsorship Gate sandbox pool. Contains no secrets.",
    epoch: String(S.pool.epoch), active: v.active, quota: String(v.quota), budget: String(v.budget), used: String(v.used),
    merkleRoot: v.root !== undefined ? v.root.toString(16).padStart(64, "0") : null,
    commitments: v.registered.map(hex), nullifiers: v.nullifiers.map(hex)
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" }));
  a.download = "sponsorship-gate-ledger-snapshot.json";
  a.click();
  URL.revokeObjectURL(a.href);
  say(true, "Snapshot downloaded. It holds only public ledger data.");
}

document.addEventListener("click", async (ev) => {
  const cp = (ev.target as HTMLElement).closest("[data-copy]") as HTMLElement | null;
  if (cp) {
    try { await navigator.clipboard.writeText(cp.dataset.copy!); say(true, "Copied to clipboard."); } catch { say(false, "Clipboard unavailable in this context."); }
    return;
  }
  const el = (ev.target as HTMLElement).closest("[data-act],[data-go]") as HTMLElement | null;
  if (!el) return;
  if (el.dataset.go) {
    S.tab = el.dataset.go as Tab;
    S.enter = true;
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  const m = member();
  switch (el.dataset.act) {
    case "demo": return guidedDemo();
    case "deploy": {
      const g = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
      const pow = POW_PRESETS.find((x) => x.id === g("f-pow"))!;
      S.params = { epochSeconds: BigInt(g("f-epoch")), quota: BigInt(Math.max(1, Math.min(10, Number(g("f-quota")) || 1))), budget: BigInt(Math.max(1, Number(g("f-budget")) || 1)), powTarget: pow.target };
      return deploy();
    }
    case "topup": return topUp();
    case "close": return deactivate();
    case "inspect": return runInspector();
    case "addmember": addMember(); return render();
    case "pick": S.sel = Number(el.dataset.i); return render();
    case "mine": return m && mine(m);
    case "register": return m && register(m).then(render);
    case "auth": return m && authorize(m, BigInt(el.dataset.slot!)).then(render);
    case "epoch": return advanceEpoch();
    case "export": return exportSnapshot();
    case "path": S.showPath = !S.showPath; return render();
    case "lab": return runPrivacyLab();
    case "attack": return runAttack(ATTACKS.find((a) => a.id === el.dataset.id)!);
    case "allattacks": return runAllAttacks();
  }
});

document.addEventListener("change", (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.id === "f-fee") { S.feePerTx = Math.max(0, Number(t.value) || 0); render(); return; }
  if (t.id === "f-min") { S.minMembers = Math.max(1, Math.min(50, Number(t.value) || 1)); render(); return; }
  if (!t.id?.startsWith("f-")) return;
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value;
  const pow = POW_PRESETS.find((x) => x.id === g("f-pow"));
  S.params = {
    epochSeconds: BigInt(g("f-epoch") ?? S.params.epochSeconds),
    quota: BigInt(Math.max(1, Math.min(10, Number(g("f-quota")) || 1))),
    budget: BigInt(Math.max(1, Number(g("f-budget")) || 1)),
    powTarget: pow?.target ?? S.params.powTarget
  };
});

fetch("./evidence-local.json")
  .then((r) => (r.ok ? r.json() : undefined))
  .then((j) => (S.evidence = j))
  .catch(() => undefined)
  .finally(() => {
    S.evidenceLoaded = true;
    if (S.tab === "chain") render();
  });

render();
