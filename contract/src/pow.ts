import { pureCircuits } from '../managed/sponsorship-gate/contract/index.js';

/**
 * Brute-force search for a nonce satisfying a pool's proof-of-work target,
 * using the contract's own pure `checkPow` circuit as ground truth. A nonce
 * accepted here is guaranteed to be accepted by the contract's `register`
 * circuit, because both paths run the identical compiled hash/prefix logic —
 * this file never reimplements the hash function independently.
 *
 * This bounds the *rate* at which new sponsorship-eligible secrets can be
 * minted (an attacker must spend real computation per identity); it does not
 * identify or limit distinct real people, and does not claim to.
 */
export function mineNonce(secret: Uint8Array, target: bigint, startAt = 0, maxAttempts = 5_000_000): Uint8Array {
  for (let i = startAt; i < startAt + maxAttempts; i++) {
    const nonce = new Uint8Array(32);
    new DataView(nonce.buffer).setUint32(0, i, false);
    if (pureCircuits.checkPow(secret, nonce, target)) {
      return nonce;
    }
  }
  throw new Error(`mineNonce: exhausted ${maxAttempts} attempts without finding a valid nonce for target ${target}`);
}

/**
 * Rough expected-attempts estimate for a given PoW target, given the prefix
 * is drawn from a uniform 24-bit space (0..16_777_215). Useful for choosing a
 * target that balances onboarding friction against sybil-registration cost;
 * this is advisory only, not a guarantee (actual attempt counts follow a
 * geometric distribution around this expectation).
 */
export function expectedAttempts(target: bigint): number {
  const space = 16_777_216n;
  if (target <= 0n) return Infinity;
  return Number(space) / Number(target);
}
