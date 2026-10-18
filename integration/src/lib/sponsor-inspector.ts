// Sponsor-side transaction inspection: the check wave 1's review said a real
// sponsor MUST do, and that wave 1 only specified.
//
// Why it exists: `authorize` commits to (pool, epoch, slot, secret) and nothing
// about the transaction it travels in. A bare nullifier therefore proves
// nothing about the *candidate* transaction in front of the sponsor, and a
// sponsee could attach anything else to a legitimate authorization (a contract
// deployment, a maintenance update, another contract's call, shielded outputs)
// and have the sponsor's DUST pay for it. So the sponsor inspects the actual
// candidate and refuses to balance anything but exactly one `register` or
// `authorize` call on its own pool.
//
// Midnight's contract-communications commitment then makes it impossible to
// swap the payload after this check: the proof is bound to the call contents.
//
// This file is deliberately free of Node and browser APIs: the sponsor service
// (src/sponsored-flow.ts) and the web console (app/) import the SAME function.

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");

export type InspectOptions = {
  /** Hex address of the pool contract this sponsor funds. */
  poolAddress: string;
  /** Entry points the sponsor is willing to pay for. */
  allowedEntryPoints?: readonly string[];
  /** Hex-encoded nullifiers already present in the pool's `spentNullifiers`. */
  spentNullifiersHex?: ReadonlySet<string>;
};

export type RejectCode =
  | "NO_CONTRACT_CALL"
  | "NOT_A_CALL" // deploy / maintenance update smuggled in
  | "TOO_MANY_ACTIONS"
  | "WRONG_CONTRACT"
  | "ENTRY_POINT_NOT_SPONSORED"
  | "HAS_ZSWAP_MOVEMENT"
  | "NULLIFIER_ALREADY_SPENT";

export type Verdict = { ok: true; entryPoint: string } | { ok: false; code: RejectCode; detail: string };

const toHexLoose = (v: unknown, seen = new WeakSet<object>()): string => {
  if (v instanceof Uint8Array) return hex(v);
  if (typeof v === "bigint") return v.toString(16);
  if (v === null || typeof v !== "object") return String(v ?? "");
  if (seen.has(v as object)) return "";
  seen.add(v as object);
  const a = v as any;
  const parts: string[] = [];
  if (typeof a.encode === "function") {
    try {
      const e = a.encode();
      if (e instanceof Uint8Array) parts.push(hex(e));
    } catch {
      /* some wrappers are not independently encodable */
    }
  }
  if (Array.isArray(v)) for (const x of v) parts.push(toHexLoose(x, seen));
  else for (const x of Object.values(a)) parts.push(toHexLoose(x, seen));
  return parts.join("|");
};

const entryName = (e: Uint8Array | string): string => (typeof e === "string" ? e : new TextDecoder().decode(e));

/**
 * Inspect a candidate transaction. Structurally typed (`any`) on purpose: the
 * ledger's signature/proof/binding generics differ between the proving and
 * balancing stages, and none of them change the fields read here.
 */
export function inspectCandidate(tx: any, opts: InspectOptions): Verdict {
  const allowed = opts.allowedEntryPoints ?? ["register", "authorize"];

  // Shielded movements would make the sponsor party to a value transfer, not
  // just a fee payer.
  const hasFallibleOffer = tx.fallibleOffer && tx.fallibleOffer.size > 0;
  if (tx.guaranteedOffer || hasFallibleOffer) {
    return { ok: false, code: "HAS_ZSWAP_MOVEMENT", detail: "candidate moves shielded value; a sponsor pays fees only" };
  }

  const actions: any[] = [];
  for (const intent of (tx.intents as Map<number, any> | undefined)?.values() ?? []) {
    for (const a of intent.actions ?? []) actions.push(a);
  }
  if (actions.length === 0) return { ok: false, code: "NO_CONTRACT_CALL", detail: "no contract action in candidate" };

  // Smuggled deploys / maintenance updates have no `entryPoint`.
  for (const a of actions) {
    if (a.entryPoint === undefined || a.address === undefined) {
      return { ok: false, code: "NOT_A_CALL", detail: `non-call action (${a.constructor?.name ?? "unknown"}) in candidate` };
    }
  }
  if (actions.length > 1) {
    return { ok: false, code: "TOO_MANY_ACTIONS", detail: `${actions.length} contract actions; expected exactly 1` };
  }

  const call = actions[0];
  if (String(call.address).toLowerCase() !== opts.poolAddress.toLowerCase()) {
    return { ok: false, code: "WRONG_CONTRACT", detail: `call targets ${call.address}, sponsor funds ${opts.poolAddress}` };
  }
  const entry = entryName(call.entryPoint);
  if (!allowed.includes(entry)) {
    return { ok: false, code: "ENTRY_POINT_NOT_SPONSORED", detail: `'${entry}' is not a sponsored entry point` };
  }

  // Replay guard: a nullifier the pool already holds is rejected on chain only
  // after the proof has been generated and the sponsor has balanced the fee.
  if (entry === "authorize" && opts.spentNullifiersHex?.size) {
    const flat = toHexLoose([call.guaranteedTranscript, call.fallibleTranscript]);
    for (const n of opts.spentNullifiersHex) {
      if (flat.includes(n)) return { ok: false, code: "NULLIFIER_ALREADY_SPENT", detail: `nullifier ${n.slice(0, 16)}... is already spent` };
    }
  }
  return { ok: true, entryPoint: entry };
}
