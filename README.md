# Sponsorship Gate

Anonymous, rate-limited fee sponsorship for Midnight — a base-layer-native alternative to account-abstraction paymasters, built from Compact's commitment, nullifier, and disclosure primitives.

## The problem

Letting a sponsor pay a stranger's transaction fee is a solved problem on transparent chains, and a badly-solved one. Ethereum's ERC-4337 paymasters make it possible, but the `paymasterAndData` field is public forever — anyone can see exactly which entity funded exactly which transaction for exactly which address. That linkability is serious enough that Ethereum's own community is actively working on fixes: a draft ERC ("privacyPaymaster") and a separate TEE-based design (GasLiteAA) both exist specifically to retrofit a privacy property the platform never had. Paymasters also face a well-documented griefing surface: a shared-storage validation step can be exploited to invalidate many unrelated operations at once, mitigated only by requiring paymasters to stake capital.

Sponsorship needs privacy for a structural reason, not a cosmetic one: the whole point of sponsoring a stranger's fee is to onboard them anonymously — tying the sponsorship to a public, permanent record of who funded whom defeats that purpose for both sides. And it needs abuse resistance, because "free to request" and "anonymous" combine into an obvious drain vector if nothing bounds it.

## What this is

A Compact contract plus a matching TypeScript test/tooling layer that lets a sponsor fund a pool of anonymous, rate-limited sponsorship slots: a user proves they've done real, verifiable work (proof-of-work, not identity) to register a slot once, then can draw one sponsored action per epoch from that slot — all without the sponsor ever learning who they are, and without the base ledger exposing a sponsor-to-user link the way a paymaster field does.

This is not a new cryptographic primitive. Proof-of-work as a Sybil-cost gate (Dwork–Naor, 1992) and epoch-scoped nullifier rate-limiting (the same shape as RLN) are both established techniques. The contribution is the composition, and specifically where it sits in the stack: Midnight already keeps its native fee-capacity resource (DUST) shielded and structurally separate from the value being moved, and exposes third-party fee-balancing (a wallet can balance a transaction using another wallet's DUST secret keys) as a base primitive rather than an application-level retrofit. This project is what a sponsorship coordination layer looks like when it is built to use that, instead of reimplementing a paymaster pattern on top of a chain that was never built for it.

## Why Midnight specifically

Three things this design leans on that a transparent chain doesn't offer natively:

* **A shielded, non-transferable fee-capacity resource (DUST)** decoupled from the value-carrying asset (NIGHT) at the protocol level, not the application level.
* **Third-party transaction balancing as a base wallet primitive** (`WalletFacade.balanceFinalizedTransaction`) — a sponsor's wallet can fee-balance a transaction it did not construct, using its own keys, without needing a bespoke "sponsor role" anywhere in the protocol.
* **Compile-time-tracked information flow** (`disclose()`): a Compact contract cannot leak witness-derived data into public state by accident. The compiler enforces the private/public boundary this design depends on.

## Status

This is a research-and-build project at an intermediate stage. Three tiers are used precisely throughout this repository:

* **SIMULATED** — executed against the compiled Compact circuit directly (`--skip-zk`, no network).
* **LOCAL** — executed against a real, running local Midnight devnet (real node, indexer, proof server).
* **LIVE** — executed against a real public network (Preprod or mainnet).

### Verified SIMULATED

* **16/16 tests passing** against the compiled circuit, including the adversarial authorization-binding suite.

The tests cover PoW registration, epoch and pool scoping, replay resistance, ownership, inactive-pool behavior, authorization races, and related security invariants.

### Verified LOCAL

* A real local Midnight devnet (node, indexer, proof server) was run and confirmed healthy.
* A wallet was genuinely funded with NIGHT and DUST through real local-chain transactions, with real transaction IDs and block heights.
* The wallet/DUST infrastructure and `balanceFinalizedTransaction` sponsorship mechanism were located and confirmed to exist in the installed SDK through direct inspection of its type signatures.
* Contract deployment to the local devnet was attempted but did not complete before submission.

A funded wallet is not the same as a deployed application. There is currently no contract address, deployment transaction, or on-chain `register`/`authorize` call.

### Not yet demonstrated

* No LOCAL contract deployment.
* No LOCAL or LIVE sponsored transaction.
* No Preprod or mainnet deployment.
* No end-to-end two-party sponsorship flow.
* No complete proof-generation flow through a deployed application.

Nothing above is represented as completed elsewhere in this README.

## The sponsorship model

This is not a Midnight "sponsor API" — there isn't one.

The verified mechanism is generic transaction balancing:

`WalletFacade.balanceFinalizedTransaction(tx, secretKeys, options)`

This allows a wallet to fee-balance a transaction using its own DUST secret keys, regardless of who constructed the transaction's other contents.

"Sponsorship" here means that a sponsor's wallet balances a transaction it did not construct after independently verifying that the transaction contains a legitimate authorization.

The repository has confirmed this mechanism exists in the installed SDK, but the complete two-party sponsorship flow has **not** yet been executed end to end.

## PoW-gated anonymous registration

A user who wants a sponsorship slot generates a local secret that is never transmitted and solves a small proof-of-work puzzle bound to that secret:

`hash(domain, secret, nonce) < difficulty target`

The contract checks a 24-bit hash prefix because a full 256-bit hash cannot be practically narrowed into the Compact integer range used for the comparison.

Registration inserts a commitment to the secret into a public set, once.

The PoW step exists because a freely regeneratable secret would make downstream rate limiting meaningless: an attacker could simply mint a fresh identity for every request. PoW raises the cost of creating identities through computation rather than money or real-world identity checks.

It provides bounded Sybil resistance, not personhood verification and not elimination of Sybil behavior.

## Epoch-scoped nullifier rate limiting

Once registered, a secret can draw one sponsored authorization per epoch per pool.

`authorize(epoch)` derives a nullifier from:

`(poolId, epoch, secret)`

It checks that the nullifier has not already been spent and consumes it.

The same secret can authorize again in a later epoch because the epoch is part of the nullifier preimage.

This is the same general rate-limiting shape used by RLN; no cryptographic novelty is claimed here.

## Trust boundary

The authorization-binding review is a load-bearing part of the design.

* `authorize()` commits to `(poolId, epoch, secret)` only.
* Two independently built transactions authorizing the same secret for the same epoch therefore produce the **same nullifier**.
* A bare nullifier is not, by itself, proof that a particular candidate transaction is the transaction that produced it.
* A sponsor must therefore verify that the transaction it is about to fee-balance **itself contains a fresh authorization effect for the relevant pool**, rather than trusting an out-of-band nullifier.

Transaction-payload substitution after sponsorship balancing begins is handled by Midnight's transaction model rather than by a bespoke application-level transaction hash. Compact's compiler includes a contract communications commitment by default, and `balanceFinalizedTransaction` operates on a finalized transaction object.

The sponsor does not receive the sponsee's registration secret or a wallet-to-secret mapping.

## What remains private / what is public

### Private

* The sponsee's registration secret.
* The mapping between a wallet and the commitment/nullifier it produced.
* Application data that the contract does not explicitly disclose.

### Public

* Pool configuration, including owner commitment, epoch length, and PoW target.
* Registered commitments.
* Spent nullifiers.
* Pool activation state.

The commitments and nullifiers are designed so that they do not directly reveal the underlying secret or wallet relationship.

## Contract architecture

`contract/src/sponsorship-gate.compact` — the on-chain sponsorship gate.

* `register(nonce)` — PoW-gated, one-time commitment insertion.
* `authorize(epoch)` — epoch-window checked, nullifier-gated authorization.
* `deactivate()` — owner-only pool deactivation using the commitment pattern.
* `checkPow` / `derivedOwnerKey` — exported pure circuits for client-side PoW and owner-commitment computation.

The contract deliberately does **not** read or move DUST. DUST handling belongs to the wallet and transaction layer.

## Off-chain sponsorship policy

`contract/src/sponsor-policy.ts` contains the off-chain sponsorship decision layer.

It provides budget-tracking logic and documents the required authorization verification boundary for a real sponsor service.

It is intentionally not presented as a live wallet/indexer integration.

## Real Midnight primitives used

* `persistentCommit` / `persistentHash` with explicit domain separation.
* `Set<Bytes<32>>` ledger state for registered commitments and spent nullifiers.
* `blockTimeGte` / `blockTimeLt` for epoch-window verification.
* `disclose()` compile-time information-flow tracking.
* Compact's default contract communications commitment.
* `WalletFacade.balanceFinalizedTransaction` for third-party fee balancing.

## Security invariants

The following are tested **SIMULATED** against the compiled circuit:

* A PoW solution is bound to one specific secret.
* A secret cannot register twice.
* A secret can authorize at most once per epoch per pool.
* The same secret can authorize again in a later epoch.
* Authorizations cannot replay across independently deployed pools.
* Two independently built candidates for the same secret/epoch produce the same nullifier.
* Competing authorizations collapse to the same canonical nullifier/replay path.
* An unregistered secret cannot authorize.
* An inactive pool rejects registration and authorization.
* Only the genuine owner secret can deactivate a pool.
* The contract has no visibility into sponsor DUST balance; fee capacity remains a wallet/transaction-layer concern.

**16/16 tests passing.**

## Limitations

* Contract deployment to a running LOCAL devnet was not completed.
* The two-party sponsored transaction flow was not executed end to end.
* No Preprod or mainnet deployment exists.
* Complete proof generation through a deployed application flow has not been demonstrated.
* Sybil resistance is bounded by proof-of-work rather than identity.
* PoW-as-Sybil-cost and epoch-scoped nullifier rate limiting are established techniques; the contribution is their Midnight-native composition and the surrounding trust-boundary design.
* `registered` and `spentNullifiers` grow without bound.
* There is no withdrawal/reclaim circuit.
* Owner authorization currently uses a hash-based commitment rather than a dedicated signature scheme.
* A real sponsor service must correctly inspect the candidate transaction's own authorization effect; this repository does not yet implement that live transaction inspection.

## Running it

Requires the [Compact toolchain](https://docs.midnight.network/getting-started/installation) and Node.js.

```bash
cd contract
npm install
npm run compact
npm test
```

`npm test` runs the SIMULATED adversarial test suite.

The `integration/` directory contains experimental deployment wiring targeting the Midnight local devnet and Preprod. It is **not part of the verified test suite and has not produced a successful contract deployment**. Running it requires the corresponding Midnight infrastructure and funded credentials.

## Repository structure

```text
contract/
  src/sponsorship-gate.compact   on-chain sponsorship gate
  src/witnesses.ts                private witness implementation
  src/pow.ts                      PoW nonce mining
  src/sponsor-policy.ts           sponsor decision/policy layer
  src/test/                       simulator and adversarial tests

integration/
  src/deploy-and-call.ts          deployment/integration experiment
  src/print-preprod-address.ts    Preprod wallet address utility
```

## License

This project is licensed under the **Apache License 2.0**. See the [`LICENSE`](LICENSE) file for the complete license text.

SPDX-License-Identifier: Apache-2.0
