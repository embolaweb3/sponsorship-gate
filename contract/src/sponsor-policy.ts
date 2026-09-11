/**
 * Off-chain sponsor-side policy: decides whether to co-sign the DUST portion
 * of a transaction that includes a call to this pool's `authorize` circuit.
 *
 * Scope boundary, stated precisely (see the Phase 8 report for the full
 * argument): the Compact contract has no way to read a sponsor's DUST
 * balance or to move DUST itself — that accounting lives at the wallet /
 * transaction-construction layer, wired through Midnight's own DUST
 * sponsorship mechanism (a sponsor's keys sign only the DUST portion of a
 * transaction; the user's keys sign the rest). This module is the missing
 * piece that decides *whether* to do that signing, given a fresh, valid
 * on-chain authorization — it is not, and does not attempt to be, a
 * reimplementation of DUST transfer.
 *
 * This module is NOT wired to a live wallet/DApp Connector or a running
 * Midnight node in this repository: doing so needs a real network, indexer,
 * and proof server, none of which are available in this test environment.
 * Presenting a mocked version of that wiring as if it were real would
 * violate the standard this build was held to, so it is left as an explicit,
 * named gap rather than faked.
 */

export interface SponsorBudgetState {
  /** A locally-tracked accounting ceiling, in whatever unit the sponsor
   * chooses to reason about (e.g., an expected-DUST-per-authorization
   * estimate) — NOT a live read of actual on-chain DUST capacity. */
  remainingBudgetUnits: number;
  /** Cost charged against the budget per accepted authorization. */
  costPerAuthorization: number;
}

export interface AuthorizationEvidence {
  /**
   * The nullifier returned by a successful `authorize` call.
   *
   * Binding requirement (Phase 10 security review — see the adversarial
   * tests in `authorization binding: what the nullifier does and does not
   * commit to`): `authorize()` commits to `(poolId, epoch, secret)` only —
   * nothing about the rest of the transaction it is bundled into. Two
   * independently-built transactions authorizing the same secret for the
   * same epoch produce the *identical* nullifier value, by design.
   *
   * A bare nullifier value is therefore not sufficient evidence on its own.
   * Before calling `shouldSponsor`, the caller MUST verify that *this
   * specific* candidate transaction — the one about to be fee-balanced via
   * `WalletFacade.balanceFinalizedTransaction` — itself contains, as one of
   * its own calls, the `authorize` effect that produced this nullifier; not
   * merely that a matching nullifier exists somewhere in the pool's public
   * state. Midnight's default contract-communications commitment (see the
   * Phase 10 report) prevents that transaction's contents from being
   * swapped after this check, but only if the check is against the
   * transaction's own effects in the first place. This module has no way to
   * perform that check itself — it requires parsing the actual
   * `FinalizedTransaction` object, which needs the indexer/provider wiring
   * this MVP does not include (see Phase 9 §10) — so it is asserted as a
   * precondition here rather than silently assumed. */
  nullifier: Uint8Array;
}

export type SponsorDecision =
  | { sponsor: true; remainingBudgetUnitsAfter: number }
  | { sponsor: false; reason: 'insufficient-budget' };

/**
 * Pure decision function: given the sponsor's current (locally-tracked)
 * budget state and a piece of authorization evidence, decide whether to
 * proceed with co-signing. Deliberately simple and deliberately honest about
 * what it is not: it cannot see real DUST balances, cannot detect a
 * sophisticated sybil operating within its rate limit, and provides bounded
 * — not eliminated — protection against budget drain, exactly as documented
 * in the Phase 7/8 research.
 */
export function shouldSponsor(state: SponsorBudgetState, _evidence: AuthorizationEvidence): SponsorDecision {
  if (state.remainingBudgetUnits < state.costPerAuthorization) {
    return { sponsor: false, reason: 'insufficient-budget' };
  }
  return { sponsor: true, remainingBudgetUnitsAfter: state.remainingBudgetUnits - state.costPerAuthorization };
}
