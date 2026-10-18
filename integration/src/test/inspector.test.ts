// Unit tests for the sponsor-side inspector. Candidates are shaped like the
// ledger's Transaction (intents -> actions -> call). The same function is run
// against real proven transactions by `npm run flow`, where it refused a real
// ContractDeploy with NOT_A_CALL; these tests pin the behavior of every other
// branch without needing a devnet.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectCandidate } from "../lib/sponsor-inspector.ts";

const POOL = "a".repeat(64);
const OTHER = "b".repeat(64);

class ContractDeploy {}
class MaintenanceUpdate {}

const call = (entryPoint: string | Uint8Array, address = POOL, guaranteedTranscript: unknown = []) => ({
  address,
  entryPoint,
  guaranteedTranscript,
  fallibleTranscript: undefined
});
const tx = (...actions: object[]) => ({ intents: new Map([[1, { actions }]]), guaranteedOffer: undefined, fallibleOffer: undefined });
const opts = (extra = {}) => ({ poolAddress: POOL, ...extra });

test("accepts exactly one register call on the sponsored pool", () => {
  assert.deepEqual(inspectCandidate(tx(call("register")), opts()), { ok: true, entryPoint: "register" });
});

test("accepts exactly one authorize call", () => {
  assert.deepEqual(inspectCandidate(tx(call("authorize")), opts()), { ok: true, entryPoint: "authorize" });
});

test("accepts a byte-array entry point (the ledger may return Uint8Array)", () => {
  const r = inspectCandidate(tx(call(new TextEncoder().encode("authorize"))), opts());
  assert.equal(r.ok, true);
});

test("pool address match is case-insensitive", () => {
  assert.equal(inspectCandidate(tx(call("register", POOL.toUpperCase())), opts()).ok, true);
});

test("refuses a transaction with no contract action", () => {
  const r = inspectCandidate({ intents: new Map(), guaranteedOffer: undefined }, opts());
  assert.deepEqual(r.ok === false && r.code, "NO_CONTRACT_CALL");
});

test("refuses a transaction with no intents at all", () => {
  const r = inspectCandidate({ intents: undefined }, opts());
  assert.deepEqual(r.ok === false && r.code, "NO_CONTRACT_CALL");
});

test("refuses a smuggled contract deployment alongside a valid call", () => {
  const r = inspectCandidate(tx(call("authorize"), new ContractDeploy()), opts());
  assert.deepEqual(r.ok === false && r.code, "NOT_A_CALL");
});

test("refuses a maintenance update", () => {
  const r = inspectCandidate(tx(new MaintenanceUpdate()), opts());
  assert.deepEqual(r.ok === false && r.code, "NOT_A_CALL");
});

test("refuses a bundle of several calls (fee inflation)", () => {
  const r = inspectCandidate(tx(call("authorize"), call("authorize"), call("register")), opts());
  assert.deepEqual(r.ok === false && r.code, "TOO_MANY_ACTIONS");
});

test("refuses calls spread across several intents too", () => {
  const t = { intents: new Map([[1, { actions: [call("authorize")] }], [2, { actions: [call("authorize")] }]]) };
  const r = inspectCandidate(t, opts());
  assert.deepEqual(r.ok === false && r.code, "TOO_MANY_ACTIONS");
});

test("refuses a call to a different contract", () => {
  const r = inspectCandidate(tx(call("authorize", OTHER)), opts());
  assert.deepEqual(r.ok === false && r.code, "WRONG_CONTRACT");
});

test("refuses owner-only entry points even on the right contract", () => {
  for (const entry of ["topUp", "deactivate"]) {
    const r = inspectCandidate(tx(call(entry)), opts());
    assert.deepEqual(r.ok === false && r.code, "ENTRY_POINT_NOT_SPONSORED", entry);
  }
});

test("the allowed entry points are configurable", () => {
  const r = inspectCandidate(tx(call("register")), opts({ allowedEntryPoints: ["authorize"] }));
  assert.deepEqual(r.ok === false && r.code, "ENTRY_POINT_NOT_SPONSORED");
});

test("refuses a candidate that moves shielded value (guaranteed offer)", () => {
  const r = inspectCandidate({ ...tx(call("authorize")), guaranteedOffer: {} }, opts());
  assert.deepEqual(r.ok === false && r.code, "HAS_ZSWAP_MOVEMENT");
});

test("refuses a candidate with a non-empty fallible offer", () => {
  const r = inspectCandidate({ ...tx(call("authorize")), fallibleOffer: new Map([[1, {}]]) }, opts());
  assert.deepEqual(r.ok === false && r.code, "HAS_ZSWAP_MOVEMENT");
});

test("an empty fallible-offer map is not a value movement", () => {
  const r = inspectCandidate({ ...tx(call("authorize")), fallibleOffer: new Map() }, opts());
  assert.equal(r.ok, true);
});

test("refuses an authorize whose nullifier is already spent (bytes in transcript)", () => {
  const spent = "ab".repeat(32);
  const transcript = [{ ops: [new Uint8Array(32).fill(0xab)] }];
  const r = inspectCandidate(tx(call("authorize", POOL, transcript)), opts({ spentNullifiersHex: new Set([spent]) }));
  assert.deepEqual(r.ok === false && r.code, "NULLIFIER_ALREADY_SPENT");
});

test("a fresh nullifier passes the replay guard", () => {
  const transcript = [{ ops: [new Uint8Array(32).fill(0x11)] }];
  const r = inspectCandidate(tx(call("authorize", POOL, transcript)), opts({ spentNullifiersHex: new Set(["ab".repeat(32)]) }));
  assert.equal(r.ok, true);
});

test("the replay guard only applies to authorize, never to register", () => {
  const transcript = [{ ops: [new Uint8Array(32).fill(0xab)] }];
  const r = inspectCandidate(tx(call("register", POOL, transcript)), opts({ spentNullifiersHex: new Set(["ab".repeat(32)]) }));
  assert.equal(r.ok, true);
});

test("a cyclic structure in a transcript does not hang the replay guard", () => {
  const cyc: any = { name: "x" };
  cyc.self = cyc;
  const r = inspectCandidate(tx(call("authorize", POOL, cyc)), opts({ spentNullifiersHex: new Set(["ab".repeat(32)]) }));
  assert.equal(r.ok, true);
});
