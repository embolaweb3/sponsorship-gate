import { describe, it, expect } from 'vitest';
import { GateSimulator, mineNonce } from './gate-simulator.js';
import { pureCircuits } from '../../managed/sponsorship-gate/contract/index.js';

const key = (n: number): Uint8Array => new Uint8Array(32).fill(n);
const EASY = 2_000_000n;
const EPOCH = 3600n;

async function pool(opts: Parameters<typeof GateSimulator.deploy>[2] = {}, user = key(1), owner = key(9)) {
  const sim = await GateSimulator.deploy(user, owner, { powTarget: EASY, epochLength: EPOCH, ownerPub: pureCircuits.derivedOwnerKey(owner), ...opts });
  return sim;
}

describe('per-epoch quota (slots)', () => {
  it('lets a member draw exactly `quota` authorizations per epoch', async () => {
    const s = key(1);
    const sim = await pool({ quota: 3n });
    await sim.register(mineNonce(s, EASY));
    const ns = [await sim.authorize(0n, 0n), await sim.authorize(0n, 1n), await sim.authorize(0n, 2n)];
    expect(new Set(ns.map((n) => Buffer.from(n).toString('hex'))).size).toEqual(3);
    await expect(sim.authorize(0n, 3n)).rejects.toThrow('slot exceeds epoch quota');
  });

  it('each slot is independently single-use within its epoch', async () => {
    const s = key(1);
    const sim = await pool({ quota: 2n });
    await sim.register(mineNonce(s, EASY));
    await sim.authorize(0n, 1n);
    await expect(sim.authorize(0n, 1n)).rejects.toThrow('already authorized this epoch');
    await expect(sim.authorize(0n, 0n)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('quota refreshes every epoch', async () => {
    const s = key(1);
    const sim = await pool({ quota: 2n });
    await sim.register(mineNonce(s, EASY));
    await sim.authorize(0n, 0n);
    await sim.authorize(0n, 1n);
    sim.setTime(Number(EPOCH) + 1);
    await expect(sim.authorize(1n, 0n)).resolves.toBeInstanceOf(Uint8Array);
    await expect(sim.authorize(1n, 1n)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('a quota-1 pool rejects slot 1 (slot cannot be used to dodge the rate limit)', async () => {
    const s = key(1);
    const sim = await pool({ quota: 1n });
    await sim.register(mineNonce(s, EASY));
    await sim.authorize(0n, 0n);
    await expect(sim.authorize(0n, 1n)).rejects.toThrow('slot exceeds epoch quota');
  });
});

describe('on-chain budget ceiling + owner topUp', () => {
  it('stops granting once maxAuthorizations is reached', async () => {
    const s = key(1);
    const sim = await pool({ budget: 2n, quota: 5n });
    await sim.register(mineNonce(s, EASY));
    await sim.authorize(0n, 0n);
    await sim.authorize(0n, 1n);
    await expect(sim.authorize(0n, 2n)).rejects.toThrow('pool budget exhausted');
    expect(sim.getLedger().authorizedCount).toEqual(2n);
  });

  it('the budget is shared across members, not per member', async () => {
    const a = key(1), b = key(2);
    const sim = await pool({ budget: 2n });
    await sim.register(mineNonce(a, EASY));
    sim.switchUser(b);
    await sim.register(mineNonce(b, EASY));
    await sim.authorize(0n);
    sim.switchUser(a);
    await sim.authorize(0n);
    sim.switchUser(b);
    await expect(sim.authorize(0n, 0n)).rejects.toThrow('pool budget exhausted');
  });

  it('owner topUp revives an exhausted pool', async () => {
    const s = key(1);
    const sim = await pool({ budget: 1n, quota: 2n });
    await sim.register(mineNonce(s, EASY));
    await sim.authorize(0n, 0n);
    await expect(sim.authorize(0n, 1n)).rejects.toThrow('pool budget exhausted');
    sim.switchOwner(key(9));
    await sim.topUp(5n);
    expect(sim.getLedger().maxAuthorizations).toEqual(5n);
    await expect(sim.authorize(0n, 1n)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('topUp cannot lower or hold the budget, and a non-owner cannot call it', async () => {
    const sim = await pool({ budget: 10n });
    sim.switchOwner(key(9));
    await expect(sim.topUp(10n)).rejects.toThrow('budget can only increase');
    await expect(sim.topUp(3n)).rejects.toThrow('budget can only increase');
    sim.switchOwner(key(44));
    await expect(sim.topUp(99n)).rejects.toThrow('not pool owner');
    expect(sim.getLedger().maxAuthorizations).toEqual(10n);
  });
});

describe('merkle membership edge cases', () => {
  it('a member who registered early can still authorize after many later registrations (historic roots)', async () => {
    const first = key(1);
    const sim = await pool();
    await sim.register(mineNonce(first, EASY));
    for (let i = 2; i <= 6; i++) {
      sim.switchUser(key(i));
      await sim.register(mineNonce(key(i), EASY));
    }
    sim.switchUser(first);
    await expect(sim.authorize(0n)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('every member of a populated pool can authorize, and each gets a distinct nullifier', async () => {
    const sim = await pool();
    const secrets = [1, 2, 3, 4, 5].map(key);
    for (const s of secrets) {
      sim.switchUser(s);
      await sim.register(mineNonce(s, EASY));
    }
    const ns = new Set<string>();
    for (const s of secrets) {
      sim.switchUser(s);
      ns.add(Buffer.from(await sim.authorize(0n)).toString('hex'));
    }
    expect(ns.size).toEqual(5);
    expect(sim.getLedger().members.firstFree()).toEqual(5n);
  });

  it('an outsider with no leaf is rejected even when the tree is populated', async () => {
    const sim = await pool();
    await sim.register(mineNonce(key(1), EASY));
    sim.switchUser(key(77));
    await expect(sim.authorize(0n)).rejects.toThrow('not registered');
  });

  it('registering twice is still rejected and does not add a second leaf', async () => {
    const s = key(1);
    const sim = await pool();
    const nonce = mineNonce(s, EASY);
    await sim.register(nonce);
    await expect(sim.register(nonce)).rejects.toThrow('already registered');
    expect(sim.getLedger().members.firstFree()).toEqual(1n);
  });

  it('membership proven against one pool does not carry to another: a member of pool A cannot authorize in empty pool B', async () => {
    const s = key(1);
    const poolA = await pool({ poolId: key(10) });
    await poolA.register(mineNonce(s, EASY));
    const poolB = await pool({ poolId: key(11) });
    await expect(poolB.authorize(0n)).rejects.toThrow('not registered');
  });
});
