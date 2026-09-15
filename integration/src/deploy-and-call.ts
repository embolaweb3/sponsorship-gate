// Real LOCAL devnet validation: deploys the sponsorship-gate contract
// (compiled with Compact 0.31.1, matching midnight-js@4.1.1's compact-runtime
// 0.16.0 dependency) and submits real, proof-bearing transactions for
// register and authorize.
//
// Provider/wallet wiring adapted directly from a working reference
// (github.com/blockend-dev/warden, infra/devnet/deploy-script-legacy) rather
// than invented — that script documents the same stable midnight-js@4.1.1
// line reaching a real deployment, where the newer midnight-js@5.0.0-beta
// line does not (a wallet-sdk-dust-wallet / midnight-js-contracts
// WASM class-identity mismatch, per that repo's own notes).
//
// Single-party probe only, per this phase's staged scope: one wallet (Alice)
// deploys, registers, and authorizes. The two-party sponsorship flow
// (Bob unbalanced, Alice balancing) is explicitly out of scope until this
// path is confirmed working end to end.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { WebSocket } from "ws";

import { type ContractAddress } from "@midnight-ntwrk/compact-runtime";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { unshieldedToken } from "@midnight-ntwrk/ledger-v8";
import { deployContract } from "@midnight-ntwrk/midnight-js/contracts";
import { setNetworkId, getNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { type MidnightProvider, type WalletProvider } from "@midnight-ntwrk/midnight-js/types";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { createKeystore, PublicKey, UnshieldedWallet } from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { NoOpTransactionHistoryStorage } from "@midnight-ntwrk/wallet-sdk-abstractions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- local Compact-compiled module, no published types package
import * as GateContract from "../contract-managed/sponsorship-gate/contract/index.js";

// @ts-expect-error: needed to enable WebSocket usage through apollo (GraphQL subscriptions)
globalThis.WebSocket = WebSocket;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(currentDir, "..", "contract-managed", "sponsorship-gate");
const privateStateId = "sponsorshipGatePrivateState";

const GENESIS_MINT_WALLET_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
const PREPROD_SEED_PATH = path.resolve(currentDir, "..", ".preprod-seed");

// TARGET=preprod npm run deploy points this at the real public Preprod
// network instead of the local devnet — everything else (contract, wallet
// logic, demo sequence) is identical either way. The proof server is
// always local regardless of target: Midnight's own docs are explicit
// that it "runs locally... because it handles your private data".
const TARGET = process.env.TARGET === "preprod" ? "preprod" : "local";
const seed = TARGET === "preprod" ? fs.readFileSync(PREPROD_SEED_PATH, "utf8").trim() : GENESIS_MINT_WALLET_SEED;

setNetworkId(TARGET === "preprod" ? "preprod" : "undeployed");

const config =
  TARGET === "preprod"
    ? {
        indexer: "https://indexer.preprod.midnight.network/api/v4/graphql",
        indexerWS: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
        node: "https://rpc.preprod.midnight.network",
        proofServer: "http://127.0.0.1:6300"
      }
    : {
        indexer: "http://127.0.0.1:8088/api/v3/graphql",
        indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
        node: "http://127.0.0.1:9944",
        proofServer: "http://127.0.0.1:6300"
      };

function log(msg: string) {
  console.log(`  ${msg}`);
}

async function withStatus<T>(message: string, fn: () => Promise<T>): Promise<T> {
  process.stdout.write(`  … ${message}`);
  try {
    const result = await fn();
    process.stdout.write(`\r  ✓ ${message}\n`);
    return result;
  } catch (e) {
    process.stdout.write(`\r  ✗ ${message}\n`);
    throw e;
  }
}

const deriveKeysFromSeed = (seed: string) => {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdWallet.type !== "seedOk") throw new Error("Failed to initialize HDWallet from seed");
  const derivationResult = hdWallet.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (derivationResult.type !== "keysDerived") throw new Error("Failed to derive keys");
  hdWallet.hdWallet.clear();
  return derivationResult.keys;
};

async function buildWallet(seed: string) {
  const keys = deriveKeysFromSeed(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());
  const walletConfig = {
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: config.indexer, indexerWsUrl: config.indexerWS },
    provingServerUrl: new URL(config.proofServer),
    relayURL: new URL(config.node.replace(/^http/, "ws")),
    txHistoryStorage: new NoOpTransactionHistoryStorage(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 }
  };
  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust)
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

const waitForSync = (wallet: WalletFacade) => Rx.firstValueFrom(wallet.state().pipe(Rx.throttleTime(2_000), Rx.filter((s) => s.isSynced)));

async function registerForDustGeneration(wallet: WalletFacade, unshieldedKeystore: ReturnType<typeof createKeystore>) {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  if (state.dust.availableCoins.length > 0 && state.dust.balance(new Date()) > 0n) {
    log(`dust already available (${state.dust.balance(new Date())})`);
    return;
  }
  const nightUtxos = state.unshielded.availableCoins.filter((c: any) => c.meta?.registeredForDustGeneration !== true);
  if (nightUtxos.length > 0) {
    await withStatus(`registering ${nightUtxos.length} NIGHT UTXO(s) for dust generation`, async () => {
      const recipe = await wallet.registerNightUtxosForDustGeneration(nightUtxos, unshieldedKeystore.getPublicKey(), (payload) =>
        unshieldedKeystore.signData(payload)
      );
      const finalized = await wallet.finalizeRecipe(recipe);
      await wallet.submitTransaction(finalized);
    });
  }
  await withStatus("waiting for dust to generate", () =>
    Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(3_000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n)
      )
    )
  );
}

async function createWalletAndMidnightProvider(ctx: Awaited<ReturnType<typeof buildWallet>>): Promise<WalletProvider & MidnightProvider> {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx: any) {
      return ctx.wallet.submitTransaction(tx) as any;
    }
  };
}

const waitForFunds = (wallet: WalletFacade): Promise<bigint> =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(30_000),
      Rx.tap(() => log("still waiting for funds — this is normal, faucet + sync can take a while")),
      Rx.filter((s) => s.isSynced),
      Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((b) => b > 0n)
    )
  );

async function main() {
  console.log(
    `\nSponsorship gate — ${TARGET === "preprod" ? "Preprod" : "LOCAL devnet"} validation (single-party probe)\n=================================================================\n`
  );

  const ctx = await withStatus(TARGET === "preprod" ? "building Preprod wallet" : "building genesis wallet", () => buildWallet(seed));
  await withStatus("syncing with node (can take a long time on Preprod — this is normal, not a failure)", () => waitForSync(ctx.wallet));
  const balance0 = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n)));
  log(`unshielded balance: ${balance0.toLocaleString()} tNight`);
  if (balance0 === 0n) {
    await withStatus("waiting for faucet funds", () => waitForFunds(ctx.wallet));
  }
  await registerForDustGeneration(ctx.wallet, ctx.unshieldedKeystore);

  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletAndMidnightProvider.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, "hex").toString("base64")}!`;

  const providers = {
    privateStateProvider: levelPrivateStateProvider<typeof privateStateId>({
      privateStateStoreName: "sponsorship-gate-private-state",
      accountId,
      privateStoragePasswordProvider: () => storagePassword
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider
  };

  // Two independent, application-level secrets — unrelated to the wallet's
  // HD-derived NIGHT/DUST/shielded keys, exactly like the contract's own
  // simulated tests. Alice plays both the registering sponsee and the pool
  // owner in this single-party probe.
  const mySecret = new Uint8Array(32).fill(1);
  const ownerSecret = new Uint8Array(32).fill(9);
  const ownerKey = (GateContract as any).pureCircuits.derivedOwnerKey(ownerSecret);

  const witnesses = {
    mySecret: (_ctx: any) => [_ctx.privateState, mySecret],
    ownerSecret: (_ctx: any) => [_ctx.privateState, ownerSecret]
  };

  const compiledContract = CompiledContract.make("sponsorship-gate", (GateContract as any).Contract).pipe(
    CompiledContract.withWitnesses(witnesses as any),
    CompiledContract.withCompiledFileAssets(zkConfigPath)
  );

  const poolId = new Uint8Array(32).fill(42);
  // Real chain block time is real wall-clock time, not block height zero —
  // anchor genesis a little in the past so "epoch 0" already contains now.
  const genesisTime = BigInt(Math.floor(Date.now() / 1000) - 60);
  const epochLength = 3600n;
  const powTarget = 16_777_216n; // full 24-bit range: any nonce satisfies this, mining is instant

  const deployed = await withStatus("deploying sponsorship-gate (0.31.1) via midnight-js@4.1.1", () =>
    deployContract(providers as any, {
      compiledContract,
      privateStateId,
      initialPrivateState: {},
      args: [poolId, genesisTime, epochLength, powTarget, ownerKey]
    } as any)
  );
  const contractAddress: ContractAddress = (deployed as any).deployTxData.public.contractAddress;
  log(`deployed at ${contractAddress}`);
  log(`deploy tx ${(deployed as any).deployTxData.public.txId} in block ${(deployed as any).deployTxData.public.blockHeight}`);

  await withStatus("register (real proof + real transaction)", async () => {
    const nonce = new Uint8Array(32); // powTarget is maximal, so any nonce satisfies checkPow
    const finalized = await (deployed as any).callTx.register(nonce);
    log(`  tx ${finalized.public.txId} in block ${finalized.public.blockHeight}`);
  });

  await withStatus("authorize epoch 0 (real proof + real transaction)", async () => {
    const finalized = await (deployed as any).callTx.authorize(0n);
    log(`  tx ${finalized.public.txId} in block ${finalized.public.blockHeight}`);
    const result = finalized.private?.result ?? finalized.result;
    log(`  nullifier: ${result ? Buffer.from(result).toString("hex") : "(circuit return value not in the expected field — see report)"}`);
  });

  try {
    await withStatus("authorize epoch 0 again (expect BLOCKED — already authorized this epoch)", async () => {
      await (deployed as any).callTx.authorize(0n);
    });
    log("  !! unexpectedly succeeded");
  } catch (e) {
    log(`  correctly rejected: ${(e as Error).message.split("\n")[0]}`);
  }

  console.log(`\n✓ ${TARGET === "preprod" ? "Preprod" : "LOCAL devnet"} validation complete — real deployment, real register/authorize transactions.\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n✗ ${TARGET === "preprod" ? "Preprod" : "LOCAL devnet"} validation failed:\n`, e);
  process.exit(1);
});
