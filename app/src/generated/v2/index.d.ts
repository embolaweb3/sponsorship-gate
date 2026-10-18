import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  mySecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  ownerSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  memberPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
             leaf_0: Uint8Array): [PS, { leaf: Uint8Array,
                                         path: { sibling: { field: bigint },
                                                 goes_left: boolean
                                               }[]
                                       }];
}

export type ImpureCircuits<PS> = {
  deactivate(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  topUp(context: __compactRuntime.CircuitContext<PS>, newMax_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  register(context: __compactRuntime.CircuitContext<PS>, nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  authorize(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            slot_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type ProvableCircuits<PS> = {
  deactivate(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  topUp(context: __compactRuntime.CircuitContext<PS>, newMax_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  register(context: __compactRuntime.CircuitContext<PS>, nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  authorize(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            slot_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type PureCircuits = {
  commitmentOf(secret_0: Uint8Array): Uint8Array;
  derivedOwnerKey(secret_0: Uint8Array): Uint8Array;
  checkPow(secret_0: Uint8Array, nonce_0: Uint8Array, target_0: bigint): boolean;
}

export type Circuits<PS> = {
  commitmentOf(context: __compactRuntime.CircuitContext<PS>,
               secret_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  derivedOwnerKey(context: __compactRuntime.CircuitContext<PS>,
                  secret_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  deactivate(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  topUp(context: __compactRuntime.CircuitContext<PS>, newMax_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  checkPow(context: __compactRuntime.CircuitContext<PS>,
           secret_0: Uint8Array,
           nonce_0: Uint8Array,
           target_0: bigint): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  register(context: __compactRuntime.CircuitContext<PS>, nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  authorize(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            slot_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type Ledger = {
  readonly poolId: Uint8Array;
  readonly genesisTime: bigint;
  readonly epochLength: bigint;
  readonly powTarget: bigint;
  readonly ownerKey: Uint8Array;
  readonly quota: bigint;
  readonly active: boolean;
  readonly maxAuthorizations: bigint;
  readonly authorizedCount: bigint;
  registered: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  members: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
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
               owner_0: Uint8Array,
               slotsPerEpoch_0: bigint,
               budget_0: bigint): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
