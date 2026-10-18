// Wave 2 deliverable: a REAL two-party sponsored flow.
//
//   Sponsor  : funded wallet. Deploys the pool, owns it, holds all DUST.
//   Sponsee  : brand-new identity with no NIGHT and no DUST at all.
//
// The sponsee builds and proves its own `register` / `authorize` call (its
// secret never leaves this process). The fee-balancing step, normally done by
// the caller's own wallet, is routed to the sponsor, which first runs
// `inspectCandidate` on the exact transaction and only then spends its DUST.
//
//   npm run flow            # LOCAL devnet
//   TARGET=preprod npm run flow:preprod

import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js/contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { type MidnightProvider, type WalletProvider } from "@midnight-ntwrk/midnight-js/types";

import {
  TARGET,
  config,
  zkConfigPath,
  integrationRoot,
  log,
  withStatus,
  buildWallet,
  waitForSync,
  registerForDustGeneration,
  dustBalance,
  deriveKeysFromSeed,
  sponsorSeed,
  type WalletCtx
} from "./lib/chain.ts";
import { inspectCandidate, type Verdict } from "./lib/sponsor-inspector.ts";
import { sponseeWitnesses } from "../../contract/src/witnesses.ts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Compact-compiled module, no published types package
import * as GateContract from "../contract-managed-v2/sponsorship-gate/contract/index.js";

const G = GateContract as any;
const trace = (m: string) => { if (process.env.TRACE) console.log(`
    [trace ${new Date().toISOString().slice(11, 23)}] ${m}`); };
const hex = (u: Uint8Array) => Buffer.from(u).toString("hex");

// ---------------------------------------------------------------- sponsor ---

/** Holds the DUST. Everything the sponsee sends passes through `sponsor()`. */
class SponsorService {
  readonly ledgerLog: Array<{ verdict: Verdict; at: string }> = [];
  /** Every transaction the sponsor actually balanced, with the fee it paid. */
  readonly sponsored: Array<{ entry: string; fee: bigint; bytesHex: string }> = [];
  private readonly ctx: WalletCtx;
  private readonly publicData: ReturnType<typeof indexerPublicDataProvider>;
  private poolAddress: string;
  constructor(ctx: WalletCtx, publicData: ReturnType<typeof indexerPublicDataProvider>, poolAddress: string) {
    this.ctx = ctx;
    this.publicData = publicData;
    this.poolAddress = poolAddress;
  }

  setPool(address: string) {
    this.poolAddress = address;
  }

  private async spentNullifiers(): Promise<Set<string>> {
    if (!this.poolAddress) return new Set();
    const state = await this.publicData.queryContractState(this.poolAddress as any);
    if (!state) return new Set();
    const l = G.ledger(state.data);
    return new Set([...l.spentNullifiers].map((n: Uint8Array) => hex(n)));
  }

  /** WalletProvider.balanceTx for the sponsee: inspect, then balance with OUR dust. */
  async sponsor(tx: any, ttl?: Date) {
    const verdict = inspectCandidate(tx, {
      poolAddress: this.poolAddress,
      spentNullifiersHex: await this.spentNullifiers()
    });
    this.ledgerLog.push({ verdict, at: new Date().toISOString() });
    if (!verdict.ok) throw new SponsorRefusal(verdict);
    const recipe = await this.ctx.wallet.balanceUnboundTransaction(
      tx,
      { shieldedSecretKeys: this.ctx.shieldedSecretKeys, dustSecretKey: this.ctx.dustSecretKey },
      { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
    );
    const fin = await this.ctx.wallet.finalizeRecipe(recipe);
    const fee = await this.ctx.wallet.calculateTransactionFee(fin);
    this.sponsored.push({ entry: verdict.entryPoint, fee, bytesHex: hex(fin.serialize()) });
    return fin;
  }

  async submit(tx: any) {
    trace(`submitting tx (${tx.identifiers?.().length ?? "?"} ids)`);
    const t0 = Date.now();
    const id = await this.ctx.wallet.submitTransaction(tx);
    trace(`submitted -> ${String(id)} in ${Date.now() - t0}ms`);
    return id as any;
  }
}

class SponsorRefusal extends Error {
  readonly verdict: Extract<Verdict, { ok: false }>;
  constructor(verdict: Extract<Verdict, { ok: false }>) {
    super(`sponsor refused: ${verdict.code} — ${verdict.detail}`);
    this.verdict = verdict;
  }
}

// ---------------------------------------------------------------- helpers ---

// Unique per run: two overlapping runs (or a crashed one) must never contend
// for the same LevelDB lock, which presents as an indefinite hang.
const RUN_ID = Date.now().toString(36);

function privateStore(name: string, accountId: string) {
  return levelPrivateStateProvider<string>({
    privateStateStoreName: `${name}-${RUN_ID}`,
    accountId,
    privateStoragePasswordProvider: () => `${Buffer.from(accountId, "hex").toString("base64")}!`
  });
}

function mineNonceLocal(secret: Uint8Array, target: bigint): { nonce: Uint8Array; attempts: number } {
  for (let i = 0; i < 20_000_000; i++) {
    const nonce = new Uint8Array(32);
    new DataView(nonce.buffer).setUint32(0, i, false);
    if (G.pureCircuits.checkPow(secret, nonce, target)) return { nonce, attempts: i + 1 };
  }
  throw new Error("pow search exhausted");
}

const flatMessage = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0];

// ------------------------------------------------------------------- main ---

async function main() {
  console.log(`\nSponsorship Gate — two-party sponsored flow (${TARGET === "preprod" ? "Preprod" : "LOCAL devnet"})\n${"=".repeat(64)}\n`);


  // ---- Sponsor: funded, holds DUST ------------------------------------
  const sponsorCtx = await withStatus("sponsor wallet: build + sync", async () => {
    const c = await buildWallet(sponsorSeed());
    await waitForSync(c.wallet);
    return c;
  });
  await registerForDustGeneration(sponsorCtx.wallet, sponsorCtx.unshieldedKeystore);
  const sponsorDust0 = await dustBalance(sponsorCtx.wallet);
  log(`sponsor DUST before: ${sponsorDust0}`);

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const publicDataProvider = indexerPublicDataProvider(config.indexer, config.indexerWS);
  const proofProvider = httpClientProofProvider(config.proofServer, zkConfigProvider);
  const sponsorState = await Rx.firstValueFrom(sponsorCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const sponsorAccount = sponsorState.shielded.coinPublicKey.toHexString();

  const sponsor = new SponsorService(sponsorCtx, publicDataProvider, "");

  // The sponsor/owner deploys with its OWN wallet (it is paying for the deploy
  // and holds the owner key), so plain balancing — no inspection needed.
  const ownerWalletProvider: WalletProvider & MidnightProvider = {
    getCoinPublicKey: () => sponsorAccount,
    getEncryptionPublicKey: () => sponsorState.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      trace("owner balanceTx start");
      const recipe = await sponsorCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: sponsorCtx.shieldedSecretKeys, dustSecretKey: sponsorCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );
      trace("owner balanceTx balanced; finalizing");
      const fin = await sponsorCtx.wallet.finalizeRecipe(recipe);
      trace("owner balanceTx finalized");
      return fin;
    },
    submitTx: (tx: any) => sponsor.submit(tx)
  };

  const ownerSecret = new Uint8Array(32).fill(9);
  const ownerKey = G.pureCircuits.derivedOwnerKey(ownerSecret);
  const ownerWitnesses = {
    ...sponseeWitnesses,
    mySecret: (c: any) => [c.privateState, new Uint8Array(32).fill(0)],
    ownerSecret: (c: any) => [c.privateState, ownerSecret]
  };
  const ownerContract = CompiledContract.make("sponsorship-gate", G.Contract).pipe(
    CompiledContract.withWitnesses(ownerWitnesses as never),
    CompiledContract.withCompiledFileAssets(zkConfigPath)
  );

  const poolId = new Uint8Array(32).fill(42);
  const genesisTime = BigInt(Math.floor(Date.now() / 1000) - 60);
  const epochLength = 3600n;
  const powTarget = 1_000_000n; // ~17 attempts: real PoW, instant on a laptop
  const quota = 2n;
  const budget = 5n;

  const ownerProviders = {
    privateStateProvider: privateStore("owner", sponsorAccount) as any,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider: ownerWalletProvider,
    midnightProvider: ownerWalletProvider
  };

  const deployed: any = await withStatus("sponsor: deploy pool (v2: merkle membership, quota=2, budget=5)", () =>
    deployContract(ownerProviders as any, {
      compiledContract: ownerContract,
      privateStateId: "owner",
      initialPrivateState: {},
      args: [poolId, genesisTime, epochLength, powTarget, ownerKey, quota, budget]
    } as any)
  );
  const poolAddress: string = deployed.deployTxData.public.contractAddress;
  sponsor.setPool(poolAddress);
  log(`pool ${poolAddress}`);
  log(`deploy tx ${deployed.deployTxData.public.txId} (block ${deployed.deployTxData.public.blockHeight})`);

  // ---- Sponsee: no funds at all ---------------------------------------
  const sponseeSeed = hex(crypto.getRandomValues(new Uint8Array(32)));
  const sponseeKeys = deriveKeysFromSeed(sponseeSeed);
  const sponseeZswap = ledger.ZswapSecretKeys.fromSeed(sponseeKeys[Roles.Zswap]);
  const sponseeAccount = sponseeZswap.coinPublicKey;
  const sponseeEncryption = sponseeZswap.encryptionPublicKey;

  const sponseeWalletProvider: WalletProvider & MidnightProvider = {
    getCoinPublicKey: () => sponseeAccount,
    getEncryptionPublicKey: () => sponseeEncryption,
    // THE SPONSORSHIP: the sponsee's wallet has nothing to balance with, so
    // the candidate goes to the sponsor, which inspects it and pays.
    balanceTx: (tx: any, ttl?: Date) => sponsor.sponsor(tx, ttl),
    submitTx: (tx: any) => sponsor.submit(tx)
  };

  const sponseeSecret = crypto.getRandomValues(new Uint8Array(32));
  const sponseeContract = CompiledContract.make("sponsorship-gate", G.Contract).pipe(
    CompiledContract.withWitnesses({
      ...sponseeWitnesses,
      ownerSecret: (c: any) => [c.privateState, new Uint8Array(32)]
    } as never),
    CompiledContract.withCompiledFileAssets(zkConfigPath)
  );
  const sponseeProviders = {
    privateStateProvider: privateStore("sponsee", sponseeAccount) as any,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider: sponseeWalletProvider,
    midnightProvider: sponseeWalletProvider
  };
  const asSponsee: any = await findDeployedContract(sponseeProviders as any, {
    contractAddress: poolAddress,
    compiledContract: sponseeContract,
    privateStateId: "sponsee",
    initialPrivateState: { secretKey: sponseeSecret }
  } as any);
  log(`sponsee has NO NIGHT and NO DUST (never funded, never synced a wallet)`);

  const steps: Array<{ step: string; txId: string; blockHeight: string }> = [
    { step: "deploy", txId: deployed.deployTxData.public.txId, blockHeight: String(deployed.deployTxData.public.blockHeight) }
  ];
  const abuse: Array<{ attempt: string; refused: boolean; message: string }> = [];

  // ---- 1. PoW + register (sponsored) ----------------------------------
  const { nonce, attempts } = await withStatus("sponsee: mine proof-of-work", async () => mineNonceLocal(sponseeSecret, powTarget));
  log(`pow solved in ${attempts} attempts`);
  const reg: any = await withStatus("sponsee: register (sponsee proves, SPONSOR pays)", () => asSponsee.callTx.register(nonce));
  log(`tx ${reg.public.txId} block ${reg.public.blockHeight}`);
  steps.push({ step: "register (sponsored)", txId: reg.public.txId, blockHeight: String(reg.public.blockHeight) });

  // ---- 2. authorize slots 0 and 1 (sponsored) -------------------------
  const epoch = BigInt(Math.floor((Math.floor(Date.now() / 1000) - Number(genesisTime)) / Number(epochLength)));
  const nullifiers: string[] = [];
  for (const slot of [0n, 1n]) {
    const r: any = await withStatus(`sponsee: authorize epoch ${epoch} slot ${slot} (sponsored)`, () => asSponsee.callTx.authorize(epoch, slot));
    const n = r.private?.result ?? r.result;
    if (n) nullifiers.push(hex(n));
    log(`tx ${r.public.txId} block ${r.public.blockHeight}`);
    steps.push({ step: `authorize epoch ${epoch} slot ${slot} (sponsored)`, txId: r.public.txId, blockHeight: String(r.public.blockHeight) });
    if (n) log(`nullifier ${hex(n)}`);
  }

  // ---- 3. abuse attempts, against the real chain ----------------------
  console.log("\n  --- abuse attempts ---");
  const expectFail = async (label: string, fn: () => Promise<unknown>, expect: RegExp) => {
    try {
      await fn();
      log(`!! ${label}: UNEXPECTEDLY SUCCEEDED`);
      process.exitCode = 1;
    } catch (e) {
      const m = flatMessage(e);
      const ok = expect.test(m);
      abuse.push({ attempt: label, refused: ok, message: m.replace(/^Unexpected error (executing|submitting) scoped transaction .<unnamed>.: /, "") });
      log(`${ok ? "✓" : "✗"} ${label}\n      -> ${m}`);
      if (!ok) process.exitCode = 1;
    }
  };

  await expectFail("third authorization in the same epoch (quota=2)", () => asSponsee.callTx.authorize(epoch, 2n), /slot exceeds epoch quota/);
  await expectFail("replay slot 0 in the same epoch", () => asSponsee.callTx.authorize(epoch, 0n), /already authorized/);

  // The sponsee tries to make the sponsor fund a contract DEPLOY.
  await expectFail(
    "sponsee asks the sponsor to pay for an unrelated contract deployment",
    () =>
      deployContract(sponseeProviders as any, {
        compiledContract: sponseeContract,
        privateStateId: "sponsee-evil",
        initialPrivateState: { secretKey: sponseeSecret },
        args: [poolId, genesisTime, epochLength, powTarget, ownerKey, 1n, 1n]
      } as any),
    /sponsor refused: (NOT_A_CALL|ENTRY_POINT_NOT_SPONSORED|NO_CONTRACT_CALL)/
  );

  // A sponsor with no DUST must fail loudly, not hang or half-submit. A second
  // sponsee tries to register through a sponsor whose wallet holds nothing.
  {
    const brokeSeed = hex(crypto.getRandomValues(new Uint8Array(32)));
    const brokeCtx = await withStatus("broke sponsor: build + sync an empty wallet", async () => {
      const c = await buildWallet(brokeSeed);
      await waitForSync(c.wallet);
      return c;
    });
    const broke = new SponsorService(brokeCtx, publicDataProvider, poolAddress);
    const sponsee2 = crypto.getRandomValues(new Uint8Array(32));
    const walletProvider2: WalletProvider & MidnightProvider = {
      getCoinPublicKey: () => sponseeAccount,
      getEncryptionPublicKey: () => sponseeEncryption,
      balanceTx: (tx: any, ttl?: Date) => broke.sponsor(tx, ttl),
      submitTx: (tx: any) => broke.submit(tx)
    };
    const providers2 = { ...sponseeProviders, privateStateProvider: privateStore("sponsee2", sponseeAccount) as any, walletProvider: walletProvider2, midnightProvider: walletProvider2 };
    const asSponsee2: any = await findDeployedContract(providers2 as any, {
      contractAddress: poolAddress,
      compiledContract: sponseeContract,
      privateStateId: "sponsee2",
      initialPrivateState: { secretKey: sponsee2 }
    } as any);
    const { nonce: nonce2 } = mineNonceLocal(sponsee2, powTarget);
    await expectFail("register through a sponsor that has no DUST", () => asSponsee2.callTx.register(nonce2), /insufficient|not enough|funds|balance|dust|coins/i);
    const l2 = G.ledger((await publicDataProvider.queryContractState(poolAddress as any))!.data);
    log(`registered commitments is still ${l2.registered.size()}: the failed attempt left no trace on chain`);
    if (l2.registered.size() !== 1n) process.exitCode = 1;
  }

  // ---- 4. results ------------------------------------------------------
  console.log("\n  --- public state, as an outside observer sees it ---");
  const finalState = await publicDataProvider.queryContractState(poolAddress as any);
  const L = G.ledger(finalState!.data);
  log(`registered commitments: ${L.registered.size()}   merkle leaves: ${L.members.firstFree()}`);
  log(`spent nullifiers: ${L.spentNullifiers.size()}   authorizedCount: ${L.authorizedCount}/${L.maxAuthorizations}`);
  const feesPaid = sponsor.sponsored.reduce((a, t) => a + t.fee, 0n);
  log(`sponsor paid ${feesPaid} DUST in fees across ${sponsor.sponsored.length} sponsored txs (sponsee paid 0; a funded wallet regenerates DUST, so a balance diff would hide this)`);

  // Real-chain privacy check: search the ACTUAL submitted transaction bytes for
  // the sponsee's commitment. register must contain it (positive control: the
  // method can see it); authorize must not.
  const commitmentHex = hex(G.pureCircuits.commitmentOf(sponseeSecret));
  const privacyCheck = sponsor.sponsored.map((t) => ({ entry: t.entry, containsCommitment: t.bytesHex.includes(commitmentHex) }));
  for (const c of privacyCheck) log(`${c.entry.padEnd(10)} tx contains sponsee commitment: ${c.containsCommitment}`);
  const controlOk = privacyCheck.filter((c) => c.entry === "register").every((c) => c.containsCommitment);
  const leakFree = privacyCheck.filter((c) => c.entry === "authorize").every((c) => !c.containsCommitment);
  log(controlOk && leakFree ? "✓ authorize transactions on this chain do not contain the member commitment" : "✗ PRIVACY CHECK FAILED");
  if (!(controlOk && leakFree)) process.exitCode = 1;
  log(`sponsor decisions: ${sponsor.ledgerLog.map((d) => (d.verdict.ok ? `OK:${d.verdict.entryPoint}` : `REFUSED:${d.verdict.code}`)).join(", ")}`);

  const evidence = {
    network: TARGET,
    poolAddress,
    deployTx: deployed.deployTxData.public.txId,
    steps,
    abuseAttempts: abuse,
    registerTx: reg.public.txId,
    nullifiers,
    sponsorFeesPaid: feesPaid.toString(),
    sponseeFeesPaid: "0",
    sponsoredTxs: sponsor.sponsored.map((t) => ({ entry: t.entry, fee: t.fee.toString() })),
    onChainPrivacyCheck: privacyCheck,
    sponsorDecisions: sponsor.ledgerLog.map((d) => d.verdict),
    observerView: {
      registered: String(L.registered.size()),
      spentNullifiers: String(L.spentNullifiers.size()),
      authorizedCount: String(L.authorizedCount)
    }
  };
  fs.writeFileSync(path.resolve(integrationRoot, `evidence-${TARGET}.json`), JSON.stringify(evidence, null, 2));
  console.log(`\n✓ done — evidence written to integration/evidence-${TARGET}.json\n`);
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("\n✗ sponsored flow failed:\n", e);
  process.exit(1);
});
