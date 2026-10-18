import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createConstructorContext, createCircuitContext, sampleContractAddress, CostModel } from '@midnight-ntwrk/compact-runtime';
import { transcriptContains } from './transcript.js';

/**
 * CONTROL EXPERIMENT. Runs the identical transcript check against the wave-1
 * contract (control/sponsorship-gate-v1.compact), whose authorize() queried
 * `registered.member(commitment)` directly. If this control did NOT leak, the
 * privacy test in privacy.test.ts would prove nothing; it does leak, so that
 * test is capable of failing.
 *
 * Needs `npm run compact:control` first; skipped (not failed) otherwise.
 */
const modPath = fileURLToPath(new URL('../../managed-v1/sponsorship-gate/contract/index.js', import.meta.url));
const available = existsSync(modPath);

describe.skipIf(!available)('control: wave-1 authorize() leaked the caller commitment', () => {
  it('commitment appears in the public transcript of v1 authorize()', async () => {
    const v1: any = await import(/* @vite-ignore */ modPath);
    const secret = new Uint8Array(32).fill(1);
    const witnesses = {
      mySecret: (ctx: any) => [ctx.privateState, secret],
      ownerSecret: (ctx: any) => [ctx.privateState, new Uint8Array(32).fill(9)],
    };
    const contract = new v1.Contract(witnesses);
    const init = await contract.initialState(createConstructorContext({}, '0'.repeat(64)), new Uint8Array(32).fill(1), 0n, 3600n, 16_777_216n, new Uint8Array(32).fill(9));
    const addr = sampleContractAddress();
    let ctx: any = createCircuitContext('c', addr, '0'.repeat(64), (init as any).currentContractState, (init as any).currentPrivateState, undefined, undefined, CostModel.initialCostModel(), 0);
    ctx = (await contract.impureCircuits.register(ctx, new Uint8Array(32))).context;
    const commitment = [...v1.ledger(ctx.callContext.currentQueryContext.state).registered][0] as Uint8Array;
    ctx = (await contract.impureCircuits.authorize(ctx, 0n)).context;
    expect(transcriptContains(ctx, commitment)).toBe(true);
  });
});
