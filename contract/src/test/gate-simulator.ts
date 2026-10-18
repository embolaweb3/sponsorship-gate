import {
  type CircuitContext,
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
  CostModel,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Ledger,
  ledger,
} from '../../managed/sponsorship-gate/contract/index.js';
import { sponseeWitnesses, type GatePrivateState as SponseePrivateState } from '../witnesses.js';

export { mineNonce } from '../pow.js';

// The test simulator also needs to act as pool *owner* in some tests, which
// the production sponsee witnesses (src/witnesses.ts) deliberately do not
// support (see that file's comment). Extend the private state and witness
// map locally, for tests only, rather than widening the production witness
// surface to accommodate a test-only role.
export type GatePrivateState = SponseePrivateState & { ownerKey: Uint8Array };

export const witnesses = {
  ...sponseeWitnesses,
  ownerSecret: (ctx: { privateState: GatePrivateState }) => [ctx.privateState, ctx.privateState.ownerKey] as const,
};

export type GateSimulatorOpts = {
  poolId?: Uint8Array;
  genesisTime?: bigint;
  epochLength?: bigint;
  powTarget?: bigint;
  ownerPub?: Uint8Array;
  quota?: bigint;
  budget?: bigint;
  time?: number;
};

export class GateSimulator {
  readonly contract: Contract<GatePrivateState>;
  circuitContext: CircuitContext<GatePrivateState>;
  readonly address = sampleContractAddress();

  private constructor(contract: Contract<GatePrivateState>, circuitContext: CircuitContext<GatePrivateState>, address: string) {
    this.contract = contract;
    this.circuitContext = circuitContext;
    this.address = address as any;
  }

  /** `Contract.initialState` is asynchronous in the installed runtime, so
   * deployment is exposed as an async factory rather than done inside a
   * (necessarily synchronous) constructor. */
  static async deploy(secretKey: Uint8Array, ownerKey: Uint8Array, opts: GateSimulatorOpts = {}): Promise<GateSimulator> {
    const contract = new Contract<GatePrivateState>(witnesses as any);
    const ctorCtx = createConstructorContext({ secretKey, ownerKey }, '0'.repeat(64));
    const init = await contract.initialState(
      ctorCtx,
      opts.poolId ?? new Uint8Array(32).fill(1),
      opts.genesisTime ?? 0n,
      opts.epochLength ?? 3600n,
      opts.powTarget ?? 16_777_216n, // full 24-bit range = PoW effectively disabled unless overridden
      opts.ownerPub ?? new Uint8Array(32).fill(9),
      opts.quota ?? 1n,
      opts.budget ?? 1_000_000n,
    );
    const address = sampleContractAddress();
    const circuitContext = createCircuitContext(
      'constructor',
      address,
      '0'.repeat(64),
      (init as any).currentContractState,
      (init as any).currentPrivateState,
      undefined,
      undefined,
      CostModel.initialCostModel(),
      opts.time ?? 0,
    );
    return new GateSimulator(contract, circuitContext, address);
  }

  /** The block time used by `blockTimeGte`/`blockTimeLt` is baked into the
   * QueryContext at construction time, not read live from `callContext.time`
   * on every call — mutating `callContext.time` alone has no effect on later
   * circuit calls. Advancing time therefore means rebuilding the circuit
   * context from scratch around the *current* ledger state and private
   * state, with the new time threaded through `createCircuitContext`. */
  setTime(t: number) {
    const currentState = this.circuitContext.callContext.currentQueryContext.state;
    const currentPrivateState = this.circuitContext.callContext.currentPrivateState as GatePrivateState;
    this.circuitContext = createCircuitContext(
      'time-advance',
      this.address as any,
      '0'.repeat(64),
      currentState,
      currentPrivateState,
      undefined,
      undefined,
      CostModel.initialCostModel(),
      t,
    );
  }

  switchUser(secretKey: Uint8Array) {
    this.circuitContext.callContext.currentPrivateState = {
      ...(this.circuitContext.callContext.currentPrivateState as GatePrivateState),
      secretKey,
    };
  }

  /** Act as the pool owner (supplies the ownerSecret witness). */
  switchOwner(ownerKey: Uint8Array) {
    this.circuitContext.callContext.currentPrivateState = {
      ...(this.circuitContext.callContext.currentPrivateState as GatePrivateState),
      ownerKey,
    };
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.callContext.currentQueryContext.state);
  }

  async register(nonce: Uint8Array): Promise<void> {
    const res = await (this.contract.impureCircuits.register as any)(this.circuitContext, nonce);
    this.circuitContext = res.context;
  }

  async authorize(epoch: bigint, slot = 0n): Promise<Uint8Array> {
    const res = await (this.contract.impureCircuits.authorize as any)(this.circuitContext, epoch, slot);
    this.circuitContext = res.context;
    return res.result;
  }

  async topUp(newMax: bigint): Promise<void> {
    const res = await (this.contract.impureCircuits.topUp as any)(this.circuitContext, newMax);
    this.circuitContext = res.context;
  }

  async deactivate(): Promise<void> {
    const res = await (this.contract.impureCircuits.deactivate as any)(this.circuitContext);
    this.circuitContext = res.context;
  }
}
