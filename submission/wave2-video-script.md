# Wave 2 demo video: shot list and narration (about 3:30)

Record the console (`npm run dev`, or the Pages build) at 1280x800, browser zoom 100%.
Have a terminal open in `integration/` with the devnet running and `evidence-local.json` from a
fresh `npm run flow`. Keep the narration plain; the on-screen highlight does the persuading.

Rubric coverage, so nothing is missed: problem (0:00), privacy shaping the design (0:25), what
changed since Wave 1 (0:25, 2:20), a working demo (1:05 to 3:00), architecture (2:20), tests and
evidence (2:00), honest status (3:00).

| Time | On screen | Narration |
|---|---|---|
| 0:00 | Overview hero | "A new user has no funds, so someone has to pay their first fee. On a transparent chain, that payment is a permanent record of who funded whom. Sponsorship Gate fixes that on Midnight: a sponsor funds a pool, and members draw a limited number of sponsored actions without anyone being able to link a request to a person." |
| 0:25 | Scroll to "What changed in Wave 2" | "Wave 2 starts with an admission. We reviewed our own Wave 1 contract and found it leaked. I'll show you the leak, the fix, and then a real transaction." |
| 0:40 | Click **Run the guided demo** | "This runs the real compiled Compact circuits in your browser. No wallet, no server. It deploys a pool, registers three members, and has each one authorize." |
| 1:05 | Observer tab: counts, commitments, nullifiers | "This is everything a stranger can read. Three commitments. Three nullifiers. Try to match one to the other: you can't. A nullifier is a hash that includes the member's secret, and the secret is never published." |
| 1:30 | Linkability lab, press **Run on Alice** | "Same member, same flow, on the Wave 1 contract and the Wave 2 contract. Wave 1: here's Alice's commitment, highlighted, in the public transcript of every authorize. Anyone could group all her requests. Wave 2: it isn't there. Just a Merkle root and a fresh nullifier." |
| 2:00 | Terminal: the privacy test output, then `evidence-local.json` `onChainPrivacyCheck` | "Our Wave 1 tests missed this because they check ledger state, and a query changes none. So the new test reads the transcript. And to prove the test can fail, we run it on the preserved Wave 1 contract, where it finds the commitment. On a real devnet we did the same over the actual transaction bytes: the commitment is in register, our positive control, and absent from both authorize calls." |
| 2:20 | Overview "Why Midnight" card, then terminal `npm run flow` output | "It's a real two-party flow. The sponsee has no NIGHT, no DUST, no wallet. It builds and proves its own transaction. The sponsor inspects it, balances it with its own DUST, and submits. Deploy in block 358, register in 366, authorize in 372 and 382. The sponsee paid nothing." |
| 2:40 | Sponsor tab: **Run all candidates** | "Before spending DUST, the sponsor inspects the exact transaction. A smuggled deploy, a bundle of calls, a call to another contract, an owner-only entry point, shielded movement, a replayed nullifier: all refused. On the devnet it refused a real contract deployment." |
| 3:00 | Attack lab: **Run all** | "Ten attacks on fresh pools: replay, an outsider, going over quota, skipping the proof-of-work, draining the budget, a non-owner topping up. Every one is refused by the circuit, so no proof exists and no transaction is made." |
| 3:15 | On-chain tab, scroll to "Reproduce it" | "Everything is reproducible: one docker compose file with pinned versions, which is also why Wave 1 never deployed. Its node was newer than the SDK expected and dropped transactions silently." |
| 3:30 | Overview, last frame | "What's not done: no Preprod deployment yet, and a pool's anonymity is only as big as its member count. Next is Preprod and a running sponsor service. Private sponsorship should be a protocol primitive, not an identity leak." |

## Before recording

- Run `npm run flow` fresh and copy `integration/evidence-local.json` to `app/public/` so the on-chain tab matches
  the block numbers you say aloud. The numbers in the table above are from the last committed run.
- Close the toast notifications before each shot; they sit at the bottom of the screen.
- Do the guided demo once off-camera to warm the wasm cache; the first load is a second slower.
