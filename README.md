# Sponsorship Gate

Anonymous, rate-limited fee sponsorship for Midnight — a base-layer-native alternative to account-abstraction paymasters, built entirely from Compact's own commitment, nullifier, and disclosure primitives.

## The problem

Letting a sponsor pay a stranger's transaction fee is a solved problem on transparent chains, and a badly-solved one. Ethereum's ERC-4337 paymasters make it possible, but the `paymasterAndData` field is public forever — anyone can see exactly which entity funded exactly which transaction for exactly which address. That linkability is serious enough that Ethereum's own community is actively working on fixes: a draft ERC ("privacyPaymaster") and a separate TEE-based design (GasLiteAA) both exist specifically to retrofit a privacy property the platform never had. Paymasters also face a well-documented griefing surface: a shared-storage validation step can be exploited to invalidate many unrelated operations at once, mitigated only by requiring paymasters to stake capital.

Sponsorship needs privacy for a structural reason, not a cosmetic one: the whole point of sponsoring a stranger's fee is to onboard them anonymously — tying the sponsorship to a public, permanent record of who funded whom defeats that purpose for both sides. And it needs abuse resistance, because "free to request" and "anonymous" combine into an obvious drain vector if nothing bounds it.

## What this is

A Compact contract plus a matching TypeScript test/tooling layer that lets a sponsor fund a pool of anonymous, rate-limited sponsorship slots: a user proves they've done real, verifiable work (proof-of-work, not identity) to register a slot once, then can draw one sponsored action per epoch from that slot — all without the sponsor ever learning who they are, and without the base ledger ever exposing a sponsor-to-user link the way a paymaster field does.

This is not a new cryptographic primitive. Proof-of-work as a sybil-cost gate (Dwork–Naor, 1992) and epoch-scoped nullifier rate-limiting (the same shape as RLN) are both established techniques. The contribution is the composition, and specifically where it sits in the stack: Midnight already keeps its own native fee-capacity resource (DUST) shielded and structurally separate from the value being moved, and already exposes third-party fee-balancing (a wallet can balance a transaction using *another* wallet's DUST secret keys) as a base primitive rather than an application-level retrofit. This project is what a sponsorship coordination layer looks like when it's built to use that, instead of reimplementing a paymaster pattern on top of a chain that was never built for it.

## Why Midnight specifically

Three things this design leans on that a transparent chain doesn't offer natively:

- **A shielded, non-transferable fee-capacity resource (DUST)** decoupled from the value-carrying asset (NIGHT) at the protocol level, not the application level.
- **Third-party transaction balancing as a base wallet primitive** (`WalletFacade.balanceFinalizedTransaction`) — a sponsor's wallet can fee-balance a transaction it did not construct, using its own keys, without needing a bespoke "sponsor role" anywhere in the protocol.
- **Compile-time-tracked information flow** (`disclose()`): a Compact contract cannot leak witness-derived data into public state by accident. The compiler enforces the private/public boundary this design depends on.

## Status

This is a research-and-build project at an intermediate, honestly-reported stage. Three tiers, used precisely throughout this repository:

- **SIMULATED** — executed against the compiled Compact circuit directly (`--skip-zk`, no network). This is what the test suite exercises.
- **LOCAL** — executed against a real, running local Midnight devnet (real node, indexer, proof server).
- **LIVE** — executed against a real public network (Preprod or mainnet).

**What is verified SIMULATED:**
- 16/16 tests passing against the compiled circuit, including the adversarial suite described below.

**What is verified LOCAL:**
- A real local Midnight devnet (node, indexer, proof server) was run and confirmed healthy.
- A wallet was genuinely funded with NIGHT and DUST through real local-chain transactions (real transaction IDs, real block heights).
- The wallet/DUST infrastructure and the `balanceFinalizedTransaction` sponsorship mechanism were located and confirmed to exist in the installed SDK, by direct inspection of its type signatures.
- **Contract deployment to the local devnet was attempted but did not complete before this submission.** A funded wallet existing is not the same as the contract being deployed — no contract address, no deployment transaction, and no on-chain `register`/`authorize` call exist yet.

**What is not yet done, stated plainly:**
- No LOCAL contract deployment.
- No LOCAL or LIVE sponsored transaction.
- No Preprod or mainnet deployment of any kind.
- No end-to-end proof generation through the full application flow (proving keys have been generated from the contract in isolation, not exercised through a live deployment).
- The two-party sponsorship flow (an unfunded wallet's transaction balanced by a sponsor's wallet) has not been executed — only the underlying `balanceFinalizedTransaction` mechanism has been confirmed to exist.

None of the above is hidden in a footnote. If a claim isn't in the two "verified" lists above, treat it as not yet demonstrated.

## The sponsorship model

Not a Midnight "sponsor API" — there isn't one. The verified mechanism is generic transaction balancing: `WalletFacade.balanceFinalizedTransaction(tx, secretKeys, options)` lets any wallet fee-balance a transaction using its own DUST secret keys, regardless of who constructed the transaction's other contents. "Sponsorship" here means a sponsor's wallet calls this on a transaction it did not build, once it has independently verified that the transaction contains a legitimate authorization (see *Trust boundary* below). This repository has located and confirmed this mechanism exists; it has not yet driven a full two-party flow through it.

## PoW-gated anonymous registration

A user who wants a sponsorship slot generates a local secret (never transmitted) and solves a small proof-of-work puzzle bound to that secret: `hash(domain, secret, nonce)` must fall under a difficulty target, checked via a 24-bit prefix of the hash (a full 256-bit hash can't be widened to a practical integer type for comparison — see the contract source for why). Registration inserts a commitment to the secret into a public set, once. The PoW step exists for one reason: without it, a freely-regeneratable secret makes any downstream rate limit meaningless, since an attacker could just mint a fresh identity per request. PoW raises the cost of minting identities via computation rather than money or a real-world identity check — it bounds the rate of sybil registration, it does not eliminate sybils or verify personhood, and this design does not claim otherwise.

## Epoch-scoped nullifier rate limiting

Once registered, a secret can draw one sponsored authorization per epoch per pool: `authorize(epoch)` derives a nullifier from `(poolId, epoch, secret)`, checks it hasn't been spent, and consumes it. The same secret can authorize again in a later epoch — this falls out of the epoch being part of the nullifier's preimage, with no special-case logic needed. This is the same rate-limiting shape used by RLN; nothing about it is claimed as novel.

## Trust boundary: what a sponsor can and cannot verify

This is the one place this project pushed the security review further than "it compiles and the tests pass," and the conclusion is load-bearing, so it's stated precisely rather than summarized away:

- `authorize()` commits to `(poolId, epoch, secret)` only. Two independently-built transactions authorizing the same secret for the same epoch produce the *identical* nullifier — confirmed by test, not just by reading the signature.
- That means **a bare nullifier value is not, by itself, proof that a specific candidate transaction is the one that produced it.** A sponsor must verify that the transaction it is about to fee-balance *itself contains*, as one of its own calls, a fresh `authorize` effect for its pool — not merely that a matching nullifier exists somewhere in the pool's public state.
- Transaction-payload substitution *after* a sponsor begins balancing is closed by the platform, not by anything this contract adds: Compact's compiler includes a contract-communications commitment by default (confirmed via `compact compile --help`), and `balanceFinalizedTransaction` operates on an already-finalized, immutable transaction object. There is no API surface, at either layer, for swapping a transaction's other contents while keeping a sponsor's approval attached. No bespoke "transaction context hash" was added to the contract, because it would duplicate a guarantee the platform already provides.
- The sponsor never receives the sponsee's registration secret or any wallet-to-secret mapping. It receives, at most, whatever a `FinalizedTransaction` object structurally exposes plus the public ledger state any observer can already read.

## What remains private / what is public

**Private, never on-chain:** the sponsee's registration secret; the mapping between a wallet and the commitment/nullifier it produced; any application data a contract doesn't explicitly `disclose()`.

**Public, by design:** the pool's configuration (owner key commitment, epoch length, PoW target); the set of registered commitments (not linkable to any wallet); the set of spent nullifiers (not linkable to any secret without already knowing it); whether a pool is active.

## Contract architecture

`contract/src/sponsorship-gate.compact` — the on-chain gate. Deliberately scoped to eligibility and rate-limiting only:

- `register(nonce)` — PoW-gated, one-time commitment insertion.
- `authorize(epoch)` — epoch-window-checked, nullifier-gated, returns the nullifier.
- `deactivate()` — owner-only, via the same secret-commitment pattern as registration (no plaintext admin address).
- `checkPow` / `derivedOwnerKey` — exported `pure` circuits so a client can search for a valid nonce, or a pool creator can compute their own owner commitment, without re-implementing the contract's hash logic independently.

The contract has no way to read or move DUST — that is deliberately left to the wallet/transaction layer described above, not simulated or faked here.

## Off-chain sponsorship policy

`contract/src/sponsor-policy.ts` implements the piece a real sponsor service needs on top of the contract: a budget-tracking decision function (`shouldSponsor`), and — most importantly — the verification requirement from the trust-boundary section, documented at the exact interface a real implementation would need to satisfy. It is explicitly not wired to a live wallet or indexer; building that wiring is the named next step, not something mocked here to look finished.

## Real Midnight primitives used

- `persistentCommit` / `persistentHash` with explicit domain separation, for commitments and nullifiers.
- `Set<Bytes<32>>` ledger state for registered commitments and spent nullifiers.
- `blockTimeGte` / `blockTimeLt` for epoch-window verification against real chain time (there is no "read current time as a value" accessor — only comparisons).
- `disclose()` compile-time taint tracking, required even for plain exported-circuit parameters flowing into public standard-library calls.
- Compact's default contract-communications commitment, relied on (not re-implemented) for the transaction-integrity argument above.
- `WalletFacade.balanceFinalizedTransaction`, confirmed by direct inspection of the installed SDK as the real mechanism behind third-party fee payment.

## Security invariants (tested, SIMULATED)

- A solved PoW puzzle is bound to one specific secret and cannot be replayed against a different one.
- A secret cannot register twice, even with a fresh valid nonce.
- A secret can authorize at most once per epoch, per pool; the same secret can authorize again in a later epoch.
- Authorizations cannot be replayed across independently deployed pools (the pool ID is read from the contract's own sealed state, never a caller-supplied argument).
- Two independently-built candidates authorizing the same secret/epoch produce the identical nullifier, and whichever reaches the canonical ledger first wins — the second fails through the same check that rejects a literal replay, by construction, not by coincidence.
- An unregistered secret cannot authorize, even after a different secret has registered.
- An inactive pool refuses both registration and authorization.
- Only the genuine owner secret can deactivate a pool.
- The contract has no visibility into sponsor DUST balance — `authorize` succeeds on eligibility alone, which is a documented scope boundary, not an oversight.

16/16 tests passing (`contract/src/test/sponsorship-gate.test.ts`), against the compiled circuit via `@midnight-ntwrk/compact-runtime`.

## Limitations, stated professionally

- Contract deployment to a running LOCAL devnet was not completed; no on-chain deployment or call exists.
- The two-party sponsored transaction flow was not executed end to end.
- No Preprod or mainnet deployment exists.
- Proof generation has been exercised for the contract's circuits in isolation (proving keys generated), not through a complete deployed-application flow.
- Sybil resistance is bounded by proof-of-work cost, not identity — this is a deliberate, disclosed limit, not a gap to be read as a bug.
- Neither PoW-as-sybil-cost nor epoch-scoped nullifier rate-limiting is novel cryptography; the contribution is the Midnight-native composition and the trust-boundary analysis around it.
- `registered` and `spentNullifiers` grow without bound; no pruning mechanism exists.
- There is no withdrawal/fund-reclaim circuit — a pool's only lifecycle action is `deactivate()`.
- Owner authorization uses the same hash-based commitment pattern as sponsee registration, not a dedicated signature scheme.
- A real sponsor service's correctness depends on it correctly inspecting a candidate transaction's own authorization effect, as documented in `sponsor-policy.ts` — this repository does not yet include that inspection code.

## Running it

Requires the [Compact toolchain](https://docs.midnight.network/getting-started/installation) and Node.js.

```bash
cd contract
npm install
npm run compact   # compiles src/sponsorship-gate.compact into managed/
npm test          # runs the SIMULATED adversarial test suite
```

`integration/` contains a deployment script (`src/deploy-and-call.ts`) built against a real local devnet and, separately, Preprod — see its own comments for the exact provider/wallet wiring. It is not run as part of the test suite; running it requires the devnet infrastructure described in Midnight's own local-network guide, or funded Preprod credentials.

## Repository structure

```
contract/
  src/sponsorship-gate.compact   the on-chain contract
  src/witnesses.ts               production sponsee witness implementation
  src/pow.ts                     PoW nonce mining, shared by tests and real clients
  src/sponsor-policy.ts          off-chain sponsor decision logic
  src/test/                      simulator + adversarial test suite (16 tests)
integration/
  src/deploy-and-call.ts         local devnet / Preprod deployment script
  src/print-preprod-address.ts   derives a Preprod wallet address to fund
```
