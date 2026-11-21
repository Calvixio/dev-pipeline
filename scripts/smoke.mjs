// Playwright smoke check shared by ci-opennext.yml (local preview) and
// deploy-cloudflare.yml (deployed URL).
//
// For every path, at phone (390 wide) and desktop (1440 wide):
//   - the final response (after redirects) must be HTTP 200
//   - the page must log no console errors and throw no uncaught exceptions
//   - an optional expected text must appear on the page
//   - a full-page screenshot is saved
//
// Usage: node smoke.mjs <base-url> <paths-file> <screenshot-dir>
// Paths file: one entry per line, "/path" or "/path | expected text".
// Blank lines and lines starting with # are ignored.
//
// Exit code 1 if any check fails. A markdown table goes to
// $GITHUB_STEP_SUMMARY when that variable is set.

import { chromium } from "playwright";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];
const NAV_TIMEOUT_MS = 45_000;
// After "load", give client-side code a moment to run and log errors.
// Pages that keep a connection open (audio, polling) never reach networkidle,
// so this wait is capped and a timeout here is expected, not a failure.
const SETTLE_TIMEOUT_MS = 5_000;

function parsePaths(text) {
  const entries = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [path, ...rest] = line.split("|");
    const p = path.trim();
    // Validate input: a path, not a full URL, so it can't point the check
    // at some other host.
    if (!p.startsWith("/") || p.startsWith("//")) {
      throw new Error(`Smoke path must start with a single "/": ${JSON.stringify(p)}`);
    }
    const expect = rest.join("|").trim();
    entries.push({ path: p, expect: expect || null });
  }
  if (entries.length === 0) throw new Error("No smoke paths given.");
  return entries;
}

function slug(path, viewport) {
  const s = path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "root";
  return `${s}-${viewport.width}.png`;
}

async function checkOne(browser, base, entry, viewport, shotDir) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`uncaught: ${err.message}`));

  const url = new URL(entry.path, base).toString();
  const result = { path: entry.path, viewport: viewport.name, status: null, finalUrl: null, problems: [] };
  try {
    const response = await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
    result.status = response ? response.status() : null;
    result.finalUrl = page.url();
    await page
      .waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => console.log(`  note: ${entry.path} @${viewport.width} not idle after ${SETTLE_TIMEOUT_MS}ms, continuing`));

    if (result.status !== 200) result.problems.push(`HTTP ${result.status ?? "no response"}`);
    if (entry.expect) {
      const body = await page.locator("body").innerText();
      if (!body.includes(entry.expect)) result.problems.push(`missing text ${JSON.stringify(entry.expect)}`);
    }
    await page.screenshot({ path: join(shotDir, slug(entry.path, viewport)), fullPage: true });
  } catch (err) {
    result.problems.push(`error: ${err.message.split("\n")[0]}`);
  }
  result.problems.push(...errors);
  await context.close();
  return result;
}

async function main() {
  const [base, pathsFile, shotDir] = process.argv.slice(2);
  if (!base || !pathsFile || !shotDir) {
    throw new Error("Usage: node smoke.mjs <base-url> <paths-file> <screenshot-dir>");
  }
  const baseUrl = new URL(base); // throws on a malformed base URL
  const entries = parsePaths(readFileSync(pathsFile, "utf8"));
  mkdirSync(shotDir, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const entry of entries) {
      for (const viewport of VIEWPORTS) {
        const r = await checkOne(browser, baseUrl, entry, viewport, shotDir);
        const mark = r.problems.length ? "FAIL" : "ok  ";
        console.log(`${mark} ${r.path} @${viewport.width} -> ${r.status} ${r.finalUrl ?? ""}`);
        for (const p of r.problems) console.log(`       ${p}`);
        results.push(r);
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.problems.length);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 300);
    const rows = results.map(
      (r) =>
        `| \`${esc(r.path)}\` | ${r.viewport} | ${r.status ?? "-"} | ${esc(r.finalUrl ?? "-")} | ${
          r.problems.length ? "❌ " + r.problems.map(esc).join("<br>") : "✅"
        } |`,
    );
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `### Smoke check against ${baseUrl.origin}`,
        "",
        "| Path | Viewport | Status | Final URL | Result |",
        "| --- | --- | --- | --- | --- |",
        ...rows,
        "",
        `${results.length - failed.length}/${results.length} passed.`,
        "",
      ].join("\n"),
    );
  }
  if (failed.length) {
    console.error(`${failed.length} of ${results.length} smoke checks failed.`);
    process.exit(1);
  }
  console.log(`All ${results.length} smoke checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
