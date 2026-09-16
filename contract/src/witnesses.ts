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

/** Witness map matching the contract's `mySecret` witness declaration. The
 * owner-only `ownerSecret` witness is intentionally not included here — pool
 * management is a separate concern with its own key material, wired up by
 * whoever deploys and administers a pool, not by ordinary sponsees. */
export const sponseeWitnesses = {
  mySecret: (ctx: { privateState: GatePrivateState }) => [ctx.privateState, ctx.privateState.secretKey] as const,
};
