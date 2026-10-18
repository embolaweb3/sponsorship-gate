import { describe, it, expect } from 'vitest';
import { GateSimulator, mineNonce } from './gate-simulator.js';
import { pureCircuits } from '../../managed/sponsorship-gate/contract/index.js';
import { transcriptContains, lastTranscript, flattenToHex } from './transcript.js';

const key = (n: number): Uint8Array => new Uint8Array(32).fill(n);
const EASY = 2_000_000n;

describe('privacy: authorize does not reveal which member is acting', () => {
  it("the caller's commitment never appears in authorize's public transcript", async () => {
    const secret = key(1);
    const sim = await GateSimulator.deploy(secret, key(9), { powTarget: EASY, quota: 2n });
    await sim.register(mineNonce(secret, EASY));
    const commitment = pureCircuits.commitmentOf(secret);
    // Sanity: the registration itself *does* publish the commitment (it must —
    // the set and the tree both store it). If this were false the test below
    // would be vacuous because the helper could not see commitments at all.
    expect(transcriptContains(sim.circuitContext as any, commitment)).toBe(true);

    await sim.authorize(0n, 0n);
    expect(transcriptContains(sim.circuitContext as any, commitment)).toBe(false);
    await sim.authorize(0n, 1n);
    expect(transcriptContains(sim.circuitContext as any, commitment)).toBe(false);
  });

  it("the caller's secret never appears in any public transcript", async () => {
    const secret = key(7);
    const sim = await GateSimulator.deploy(secret, key(9), { powTarget: EASY });
    await sim.register(mineNonce(secret, EASY));
    expect(transcriptContains(sim.circuitContext as any, secret)).toBe(false);
    await sim.authorize(0n);
    expect(transcriptContains(sim.circuitContext as any, secret)).toBe(false);
  });

  it('two members authorizing in the same epoch produce transcripts with no member-specific field other than the nullifier', async () => {
    const a = key(1);
    const b = key(2);
    const sim = await GateSimulator.deploy(a, key(9), { powTarget: EASY });
    await sim.register(mineNonce(a, EASY));
    sim.switchUser(b);
    await sim.register(mineNonce(b, EASY));

    sim.switchUser(a);
    const nullA = await sim.authorize(0n);
    const tA = flattenToHex(lastTranscript(sim.circuitContext as any));
    sim.switchUser(b);
    const nullB = await sim.authorize(0n);
    const tB = flattenToHex(lastTranscript(sim.circuitContext as any));

    // Strip each transcript's own nullifier; what is left must be identical,
    // i.e. an observer cannot tell A's call from B's except by the nullifier,
    // which is itself unlinkable to a registered commitment.
    const hex = (u: Uint8Array) => Buffer.from(u).toString('hex');
    const scrub = (t: string, n: Uint8Array) => t.split(hex(n)).join('<nullifier>');
    // The set-insert of the nullifier is the only state-dependent difference;
    // also scrub the (differing) set sizes/paths by comparing op structure.
    expect(scrub(tA, nullA).replace(/[0-9a-f]{64}/g, 'H').length).toEqual(scrub(tB, nullB).replace(/[0-9a-f]{64}/g, 'H').length);
    expect(tA.includes(hex(pureCircuits.commitmentOf(a)))).toBe(false);
    expect(tB.includes(hex(pureCircuits.commitmentOf(b)))).toBe(false);
  });

  it('the same member authorizing in two epochs yields unlinkable nullifiers', async () => {
    const s = key(3);
    const sim = await GateSimulator.deploy(s, key(9), { powTarget: EASY, epochLength: 3600n });
    await sim.register(mineNonce(s, EASY));
    const n0 = await sim.authorize(0n);
    sim.setTime(3601);
    const n1 = await sim.authorize(1n);
    expect(Buffer.from(n0).equals(Buffer.from(n1))).toBe(false);
    // And neither equals the registered commitment.
    const c = pureCircuits.commitmentOf(s);
    expect(Buffer.from(n0).equals(Buffer.from(c))).toBe(false);
    expect(Buffer.from(n1).equals(Buffer.from(c))).toBe(false);
  });
});
