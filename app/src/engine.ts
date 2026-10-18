// In-browser pool engine. Runs the REAL compiled Compact circuits (the same
// generated modules the vitest suite runs) against an in-memory ledger.
// Nothing here re-implements contract logic: every rule comes from the circuit.

import {
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
  CostModel,
  type CircuitContext
} from "@midnight-ntwrk/compact-runtime";
import * as V2 from "./generated/v2/index.js";
import * as V1 from "./generated/v1/index.js";
import { sponseeWitnesses } from "../../contract/src/witnesses.ts";

export const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
export const short = (h: string, n = 8) => (h.length > 2 * n + 1 ? `${h.slice(0, n)}…${h.slice(-n)}` : h);
export const randomBytes32 = () => crypto.getRandomValues(new Uint8Array(32));

export type PoolParams = {
  epochSeconds: bigint;
  quota: bigint;
  budget: bigint;
  /** PoW target against a 24-bit prefix; expected attempts = 2^24 / target. */
  powTarget: bigint;
};

export type PrivateState = { secretKey: Uint8Array; ownerKey: Uint8Array };

const witnesses = {
  ...sponseeWitnesses,
  ownerSecret: (ctx: { privateState: PrivateState }) => [ctx.privateState, ctx.privateState.ownerKey] as const
};

/** Humanizes the circuit's assertion messages for the UI. */
export function explain(err: unknown): { code: string; text: string } {
  const raw = String((err as Error)?.message ?? err);
  const m = raw.match(/(pool not active|slot exceeds epoch quota|pool budget exhausted|epoch out of range for current block time|not registered|already authorized this epoch|already registered|pow requirement not met|not pool owner|budget can only increase)/);
  const code = m ? m[1] : "error";
  const text: Record<string, string> = {
    "pool not active": "The sponsor has closed this pool.",
    "slot exceeds epoch quota": "That slot is beyond the per-epoch quota.",
    "pool budget exhausted": "The pool's authorization budget is used up.",
    "epoch out of range for current block time": "That epoch is not the current one.",
    "not registered": "No registered membership proof exists for this secret.",
    "already authorized this epoch": "This slot was already used this epoch (nullifier spent).",
    "already registered": "This secret is already registered.",
    "pow requirement not met": "The proof-of-work nonce does not meet the pool's difficulty.",
    "not pool owner": "Only the pool owner's secret can do that.",
    "budget can only increase": "The budget can only be raised, never lowered."
  };
  return { code, text: text[code] ?? raw.split("\n")[0] };
}

export type TranscriptProbe = {
  /** True if `needle` appears anywhere in the call's public transcript. */
  contains: (needle: Uint8Array) => boolean;
  /** Public transcript, flattened to hex-ish text (for display). */
  flat: string;
};

function flatten(value: unknown, seen = new WeakSet<object>()): string {
  if (value instanceof Uint8Array) return hex(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return String(value);
  if (seen.has(value as object)) return "";
  seen.add(value as object);
  const a = value as any;
  const parts: string[] = [];
  if (typeof a.encode === "function") {
    try {
      const enc = a.encode();
      if (enc instanceof Uint8Array) parts.push(hex(enc));
    } catch {
      /* not every wrapper encodes on its own */
    }
  }
  if (Array.isArray(value)) for (const v of value) parts.push(flatten(v, seen));
  else for (const v of Object.values(a)) parts.push(flatten(v, seen));
  return parts.join("|");
}

export function probe(ctx: { callProofDataTrace?: any[] }): TranscriptProbe {
  const last = (ctx.callProofDataTrace ?? []).at(-1);
  const flat = last ? flatten(last.publicTranscript) : "";
  return { flat, contains: (n) => flat.includes(hex(n)) };
}

export type LedgerView = {
  active: boolean;
  quota: bigint;
  budget: bigint;
  used: bigint;
  epochSeconds: bigint;
  genesis: bigint;
  registered: Uint8Array[];
  nullifiers: Uint8Array[];
  leaves: bigint;
  root: bigint | undefined;
};

/** One deployed pool. `ver` selects the wave-2 contract or the wave-1 control. */
export class Pool {
  readonly ver: "v1" | "v2";
  readonly address = sampleContractAddress();
  readonly ownerSecret = randomBytes32();
  readonly params: PoolParams;
  private mod: any;
  private contract: any;
  ctx!: CircuitContext<PrivateState>;
  now = 0;

  private constructor(ver: "v1" | "v2", params: PoolParams) {
    this.ver = ver;
    this.params = params;
    this.mod = ver === "v2" ? V2 : V1;
  }

  static async deploy(params: PoolParams, ver: "v1" | "v2" = "v2"): Promise<Pool> {
    const p = new Pool(ver, params);
    p.contract = new p.mod.Contract(
      ver === "v2"
        ? witnesses
        : {
            mySecret: (c: { privateState: PrivateState }) => [c.privateState, c.privateState.secretKey],
            ownerSecret: witnesses.ownerSecret
          }
    );
    const ownerPub = p.mod.pureCircuits.derivedOwnerKey(p.ownerSecret);
    const initial: PrivateState = { secretKey: new Uint8Array(32), ownerKey: p.ownerSecret };
    const args: any[] = [new Uint8Array(32).fill(7), 0n, params.epochSeconds, params.powTarget, ownerPub];
    if (ver === "v2") args.push(params.quota, params.budget);
    const init = await p.contract.initialState(createConstructorContext(initial, "0".repeat(64)), ...args);
    p.rebuild(init.currentContractState, init.currentPrivateState);
    return p;
  }

  private rebuild(state: any, priv: PrivateState) {
    this.ctx = createCircuitContext("browser", this.address as any, "0".repeat(64), state, priv, undefined, undefined, CostModel.initialCostModel(), this.now);
  }

  /** Block time is baked into the query context, so advancing the clock means
   * rebuilding the context around the current state (see tests' GateSimulator). */
  setTime(t: number) {
    this.now = t;
    const cc: any = this.ctx.callContext;
    this.rebuild(cc.currentQueryContext.state, cc.currentPrivateState);
  }

  as(secret: Uint8Array, owner = false) {
    const cc: any = this.ctx.callContext;
    cc.currentPrivateState = { secretKey: secret, ownerKey: owner ? this.ownerSecret : new Uint8Array(32) };
  }

  commitmentOf(secret: Uint8Array): Uint8Array {
    return this.ver === "v2" ? this.mod.pureCircuits.commitmentOf(secret) : this.v1Commitment(secret);
  }
  /** v1 did not export commitmentOf; read the commitment back off the ledger
   * after registration instead (see `lastRegistered`). */
  private v1Commitment(_secret: Uint8Array): Uint8Array {
    return this.lastRegistered() ?? new Uint8Array(32);
  }
  lastRegistered(): Uint8Array | undefined {
    return [...this.view().registered].at(-1);
  }

  mine(secret: Uint8Array, startAt = 0, maxAttempts = 200_000): { nonce?: Uint8Array; next: number } {
    for (let i = startAt; i < startAt + maxAttempts; i++) {
      const nonce = new Uint8Array(32);
      new DataView(nonce.buffer).setUint32(0, i, false);
      if (this.mod.pureCircuits.checkPow(secret, nonce, this.params.powTarget)) return { nonce, next: i + 1 };
    }
    return { next: startAt + maxAttempts };
  }

  private async call(name: string, ...args: unknown[]) {
    const res = await this.contract.impureCircuits[name](this.ctx, ...args);
    this.ctx = res.context;
    return res.result;
  }

  register(secret: Uint8Array, nonce: Uint8Array) {
    this.as(secret);
    return this.call("register", nonce);
  }
  authorize(secret: Uint8Array, epoch: bigint, slot: bigint): Promise<Uint8Array> {
    this.as(secret);
    return this.ver === "v2" ? this.call("authorize", epoch, slot) : this.call("authorize", epoch);
  }
  topUp(newMax: bigint, asOwner = true) {
    this.as(new Uint8Array(32), asOwner);
    return this.call("topUp", newMax);
  }
  deactivate(asOwner = true) {
    this.as(new Uint8Array(32), asOwner);
    return this.call("deactivate");
  }

  get epoch(): bigint {
    return BigInt(Math.floor(this.now / Number(this.params.epochSeconds)));
  }

  view(): LedgerView {
    const l: any = this.mod.ledger((this.ctx.callContext as any).currentQueryContext.state);
    return {
      active: l.active,
      quota: this.ver === "v2" ? l.quota : 1n,
      budget: this.ver === "v2" ? l.maxAuthorizations : 0n,
      used: this.ver === "v2" ? l.authorizedCount : BigInt(l.spentNullifiers.size()),
      epochSeconds: l.epochLength,
      genesis: l.genesisTime,
      registered: [...l.registered],
      nullifiers: [...l.spentNullifiers],
      leaves: this.ver === "v2" ? l.members.firstFree() : 0n,
      root: this.ver === "v2" ? l.members.root().field : undefined
    };
  }

  transcript(): TranscriptProbe {
    return probe(this.ctx as any);
  }
}

export const POW_PRESETS = [
  { id: "instant", label: "Instant (demo)", target: 16_777_216n },
  { id: "easy", label: "Easy · ~8 tries", target: 2_000_000n },
  { id: "medium", label: "Medium · ~64 tries", target: 262_144n },
  { id: "hard", label: "Hard · ~512 tries", target: 32_768n }
];
