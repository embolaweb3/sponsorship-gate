// Copies the compiled (--skip-zk) JS contract modules into the app so the
// browser bundle runs the exact circuits the tests ran. Run after
// `npm run compact` and `npm run compact:control` in ../contract.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const jobs = [
  ["contract/managed/sponsorship-gate/contract", "app/src/generated/v2"],
  ["contract/managed-v1/sponsorship-gate/contract", "app/src/generated/v1"]
];
for (const [from, to] of jobs) {
  const src = path.join(root, from);
  if (!existsSync(src)) {
    console.error(`missing ${from} — compile the contract first`);
    process.exit(1);
  }
  mkdirSync(path.join(root, to), { recursive: true });
  cpSync(src, path.join(root, to), { recursive: true });
  console.log(`synced ${from} -> ${to}`);
}
