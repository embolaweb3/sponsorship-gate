import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  mySecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  ownerSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  deactivate(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  register(context: __compactRuntime.CircuitContext<PS>, nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  authorize(context: __compactRuntime.CircuitContext<PS>, epoch_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type ProvableCircuits<PS> = {
  deactivate(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  register(context: __compactRuntime.CircuitContext<PS>, nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  authorize(context: __compactRuntime.CircuitContext<PS>, epoch_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type PureCircuits = {
  derivedOwnerKey(secret_0: Uint8Array): Uint8Array;
  checkPow(secret_0: Uint8Array, nonce_0: Uint8Array, target_0: bigint): boolean;
}

export type Circuits<PS> = {
  derivedOwnerKey(context: __compactRuntime.CircuitContext<PS>,
                  secret_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  deactivate(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  checkPow(context: __compactRuntime.CircuitContext<PS>,
           secret_0: Uint8Array,
           nonce_0: Uint8Array,
           target_0: bigint): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  register(context: __compactRuntime.CircuitContext<PS>, nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  authorize(context: __compactRuntime.CircuitContext<PS>, epoch_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type Ledger = {
  readonly poolId: Uint8Array;
  readonly genesisTime: bigint;
  readonly epochLength: bigint;
  readonly powTarget: bigint;
  readonly ownerKey: Uint8Array;
  readonly active: boolean;
  registered: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  spentNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               id_0: Uint8Array,
               startTime_0: bigint,
               epochSeconds_0: bigint,
               target_0: bigint,
               owner_0: Uint8Array): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
