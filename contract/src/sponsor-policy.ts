/**
 * Off-chain sponsor-side policy: decides whether to co-sign the DUST portion
 * of a transaction that includes a call to this pool's `authorize` circuit.
 *
 * The Compact contract has no way to read a sponsor's DUST balance or move
 * DUST itself — that lives at the wallet/transaction layer, via Midnight's
 * transaction-balancing mechanism (a sponsor can balance a finalized
 * transaction using its own DUST secret keys, independent of who built the
 * transaction's other contents). This module is the missing piece that
 * decides *whether* to do that balancing, given a fresh, valid authorization.
 *
 * Not wired to a live wallet/provider stack: that requires the indexer and
 * transaction-inspection wiring described in the project README's status
 * section, which is not yet built.
 */

export interface SponsorBudgetState {
  /** A locally-tracked accounting ceiling, not a live read of on-chain DUST capacity. */
  remainingBudgetUnits: number;
  /** Cost charged against the budget per accepted authorization. */
  costPerAuthorization: number;
}

export interface AuthorizationEvidence {
  /**
   * The nullifier returned by a successful `authorize` call.
   *
   * `authorize()` commits to `(poolId, epoch, secret)` only — nothing about
   * the rest of the transaction it is bundled into. Two independently-built
   * transactions authorizing the same secret for the same epoch produce the
   * identical nullifier, by design (see the contract's adversarial tests).
   *
   * A bare nullifier is therefore not sufficient evidence: before calling
   * `shouldSponsor`, the caller must verify that the specific candidate
   * transaction about to be fee-balanced itself contains, as one of its own
   * calls, the `authorize` effect that produced this nullifier — not merely
   * that a matching nullifier exists somewhere in the pool's public state.
   * Midnight's contract-communications commitment prevents a transaction's
   * contents from being swapped after that check, but only if the check is
   * against the transaction's own effects in the first place. This module
   * cannot perform that check itself (it needs the indexer/provider wiring
   * described in the README), so it is asserted as a precondition here.
   */
  nullifier: Uint8Array;
}

export type SponsorDecision =
  | { sponsor: true; remainingBudgetUnitsAfter: number }
  | { sponsor: false; reason: 'insufficient-budget' };

/**
 * Pure decision function. Cannot see real DUST balances and cannot detect a
 * sybil operating within its own rate limit — it provides bounded, not
 * eliminated, protection against budget drain.
 */
export function shouldSponsor(state: SponsorBudgetState, _evidence: AuthorizationEvidence): SponsorDecision {
  if (state.remainingBudgetUnits < state.costPerAuthorization) {
    return { sponsor: false, reason: 'insufficient-budget' };
  }
  return { sponsor: true, remainingBudgetUnitsAfter: state.remainingBudgetUnits - state.costPerAuthorization };
}
