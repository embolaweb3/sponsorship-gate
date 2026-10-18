/**
 * Production witness implementations for the sponsorship gate contract.
 *
 * A witness is a TypeScript function with no Compact body: Compact declares
 * its signature (`witness mySecret(): Bytes<32>;`) and the driver — this file
 * — supplies the value at call time. Witness output is never verified by the
 * circuit itself; the circuit only checks that whatever the witness returned
 * was used consistently. Nothing here needs to, or should, prove the secret
 * is "real" in any identity sense — that is exactly the property this design
 * deliberately does not claim.
 */

export type GatePrivateState = {
  /** The user's own sponsorship-eligibility secret. Generated once, kept
   * only on the user's device, never transmitted. Losing it means losing the
   * ability to authorize further sponsored actions under the identity it
   * registered — there is no recovery path in this MVP (see limitations). */
  secretKey: Uint8Array;
};

/** Generates a fresh, uniformly random 32-byte secret. Call once per
 * sponsorship identity a user wants to maintain; nothing prevents generating
 * more than one, which is precisely why registration is PoW-gated rather
 * than free (see src/pow.ts). */
export function generateSecret(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

const TREE_DEPTH = 10;

/** Placeholder returned when a secret's commitment is not in the Merkle tree.
 * The witness may not throw a domain error of its own choosing here; it must
 * return *a* path, and the circuit's `path.leaf == commitment` assertion then
 * rejects it with the contract's own "not registered" message. */
function absentPath() {
  return {
    leaf: new Uint8Array(32),
    path: Array.from({ length: TREE_DEPTH }, () => ({ sibling: { field: 0n }, goes_left: false })),
  };
}

/** Looks up the Merkle path for `leaf` in the pool's public `members` tree.
 * The path is private witness data: it is hashed to a root inside the circuit
 * and only the root is ever disclosed, which is what keeps `authorize` from
 * revealing which member is acting. */
export const memberPathWitness = (ctx: { privateState: GatePrivateState; ledger: any }, leaf: Uint8Array) =>
  [ctx.privateState, ctx.ledger.members.findPathForLeaf(leaf) ?? absentPath()] as const;


/** Witness map matching the contract's `mySecret` witness declaration. The
 * owner-only `ownerSecret` witness is intentionally not included here — pool
 * management is a separate concern with its own key material, wired up by
 * whoever deploys and administers a pool, not by ordinary sponsees. */
export const sponseeWitnesses = {
  memberPath: memberPathWitness,
  mySecret: (ctx: { privateState: GatePrivateState }) => [ctx.privateState, ctx.privateState.secretKey] as const,
};
