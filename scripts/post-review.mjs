// Turns the reviewer's structured output into a PR review body and a verdict.
//
// Usage: node post-review.mjs <review-json-file> <body-out-file>
// Prints "block" or "pass" on stdout. Exits 1 if the JSON is missing or does
// not match the expected shape, so a broken reviewer run never reads as a pass.

import { readFileSync, writeFileSync } from "node:fs";

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error("Usage: node post-review.mjs <review-json-file> <body-out-file>");
  process.exit(1);
}

let review;
try {
  review = JSON.parse(readFileSync(inFile, "utf8"));
} catch (err) {
  console.error(`Reviewer output is not valid JSON: ${err.message}`);
  process.exit(1);
}

const VERDICTS = new Set(["pass", "block"]);
const SEVERITIES = ["blocking", "warning", "nit"];
if (!review || !VERDICTS.has(review.verdict) || !Array.isArray(review.findings)) {
  console.error("Reviewer output is missing a valid verdict or findings array.");
  process.exit(1);
}

// A "pass" with a blocking finding is treated as a block.
const hasBlocking = review.findings.some((f) => f.severity === "blocking");
const verdict = review.verdict === "block" || hasBlocking ? "block" : "pass";

const clean = (s) => String(s ?? "").replace(/\r/g, "").trim();
const lines = [
  `## Independent review: ${verdict === "block" ? "❌ blocking issues found" : "✅ no blocking issues"}`,
  "",
  clean(review.summary),
  "",
];
for (const sev of SEVERITIES) {
  const group = review.findings.filter((f) => f.severity === sev);
  if (!group.length) continue;
  lines.push(`### ${sev} (${group.length})`, "");
  for (const f of group) {
    const where = f.line ? `${clean(f.file)}:${f.line}` : clean(f.file);
    lines.push(`- **${clean(f.title)}** — \`${where}\``, `  ${clean(f.detail).replace(/\n/g, "\n  ")}`);
  }
  lines.push("");
}
lines.push("<sub>Posted by dev-pipeline reviewer.yml. The reviewer did not write this code.</sub>");

writeFileSync(outFile, lines.join("\n"));
console.log(verdict);
