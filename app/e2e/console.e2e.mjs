// End-to-end test of the web console in a real browser.
//   npm run build && npm run preview &        (serves http://127.0.0.1:4173)
//   CHROME_PATH=/path/to/chrome npm run e2e
// Needs a Chrome/Chromium binary; playwright-core is a dev dependency but does
// not download browsers.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const URL = process.env.URL ?? "http://127.0.0.1:4173/";
const shots = process.env.SHOTS ?? "e2e/screenshots";
mkdirSync(shots, { recursive: true });
let failed = 0;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

const step = async (name, fn) => {
  try {
    await fn();
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "->", String(e.message).split("\n").slice(0, 14).join(" | "));
  }
};

await page.goto(URL);
await step("overview renders", async () => {
  await page.waitForSelector("h1");
  await page.screenshot({ path: `${shots}/01-overview.png` });
});

await step("guided demo populates pool and lands on observer", async () => {
  await page.click('[data-act="demo"]');
  await page.waitForSelector("text=commitments", { timeout: 90000 });
  await page.waitForSelector("text=Linkability lab");
  await page.screenshot({ path: `${shots}/02-observer.png`, fullPage: true });
});

await step("privacy lab: v1 leaks, v2 does not", async () => {
  const txt = await page.innerText("main");
  if (!txt.includes("commitment FOUND in transcript")) throw new Error("v1 leak not shown");
  if (!txt.includes("commitment NOT in transcript")) throw new Error("v2 non-leak not shown");
  await page.screenshot({ path: `${shots}/03-lab.png`, fullPage: true });
});

await step("sponsor tab: inspector verdicts", async () => {
  await page.click('[data-go="sponsor"]');
  await page.click('[data-act="inspect"]');
  const t = await page.innerText("main");
  for (const code of ["NOT_A_CALL", "TOO_MANY_ACTIONS", "WRONG_CONTRACT", "ENTRY_POINT_NOT_SPONSORED", "HAS_ZSWAP_MOVEMENT", "NULLIFIER_ALREADY_SPENT"])
    if (!t.includes(code)) throw new Error("missing " + code);
  if ((t.match(/balance it/g) ?? []).length !== 2) throw new Error("expected exactly 2 'balance it'");
  await page.screenshot({ path: `${shots}/04-sponsor.png`, fullPage: true });
});

await step("attack lab: all attacks refused with expected code", async () => {
  await page.click('[data-go="attacks"]');
  await page.click('[data-act="allattacks"]');
  await page.waitForFunction(() => document.querySelectorAll(".attack .result.ok").length === 10, null, { timeout: 120000 });
  await page.screenshot({ path: `${shots}/05-attacks.png`, fullPage: true });
});

await step("member flow by hand: mine, register, authorize x quota, then refused", async () => {
  await page.click('[data-go="sponsor"]');
  await page.click('[data-act="deploy"]');
  await page.waitForSelector("text=Pool deployed");
  await page.click('[data-go="member"]');
  await page.click('[data-act="addmember"]');
  await page.click('[data-act="mine"]');
  await page.waitForSelector("text=✓ solved", { timeout: 60000 });
  await page.click('[data-act="register"]');
  await page.waitForSelector("text=✓ registered");
  await page.click('[data-act="auth"][data-slot="0"]');
  await page.waitForSelector("text=authorized (epoch 0, slot 0)");
  await page.click('[data-act="auth"][data-slot="0"]');
  await page.waitForSelector("text=already used this epoch");
  await page.click('[data-act="epoch"]');
  await page.click('[data-act="auth"][data-slot="0"]');
  await page.waitForSelector("text=authorized (epoch 1, slot 0)");
  await page.screenshot({ path: `${shots}/06-member.png`, fullPage: true });
});

await step("on-chain tab renders", async () => {
  await page.click('[data-go="chain"]');
  await page.waitForSelector("text=Reproduce it");
  await page.screenshot({ path: `${shots}/07-chain.png`, fullPage: true });
});

await step("mobile layout has no horizontal overflow", async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const tab of ["overview", "sponsor", "member", "observer", "attacks", "chain"]) {
    await page.click(`[data-go="${tab}"]`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 2) throw new Error(`${tab} overflows by ${over}px`);
  }
  await page.screenshot({ path: `${shots}/08-mobile.png` });
});

console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
