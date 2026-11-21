// Classifies a PR by its changed file paths only. Never reads PR text.
//
// Usage: node risk-gate.mjs <defaults.json> <caller.json|-> <files.txt> <result.json>
//   defaults.json / caller.json: { ask_first: [...], low_risk: [...] } (YAML
//   already converted to JSON). Pass "-" when the caller has no config.
//   files.txt: one changed path per line (include old paths of renames).
// Writes { risk: "ask-first" | "low-risk" | "standard", askFirst: [...],
//          notLowRisk: [...], askFirstPatterns, lowRiskPatterns } to result.json.

import { readFileSync, writeFileSync } from "node:fs";

function loadConfig(file) {
  if (file === "-") return {};
  const data = JSON.parse(readFileSync(file, "utf8")) ?? {};
  for (const key of ["ask_first", "low_risk"]) {
    if (data[key] != null && !(Array.isArray(data[key]) && data[key].every((p) => typeof p === "string" && p.trim()))) {
      throw new Error(`${file}: "${key}" must be a list of non-empty strings`);
    }
  }
  return data;
}

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**/" also matches zero directories
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, "i");
}

export function matches(path, pattern) {
  const p = pattern.trim().replace(/^\.\//, "");
  const rx = globToRegExp(p);
  if (p.includes("/")) return rx.test(path);
  return path.split("/").some((segment) => rx.test(segment));
}

function main() {
  const [defaultsFile, callerFile, filesFile, outFile] = process.argv.slice(2);
  if (!defaultsFile || !callerFile || !filesFile || !outFile) {
    throw new Error("Usage: node risk-gate.mjs <defaults.json> <caller.json|-> <files.txt> <result.json>");
  }
  const defaults = loadConfig(defaultsFile);
  const caller = loadConfig(callerFile);

  const askFirstPatterns = [...new Set([...(defaults.ask_first ?? []), ...(caller.ask_first ?? [])])];
  const lowRiskPatterns = caller.low_risk ?? defaults.low_risk ?? [];
  if (askFirstPatterns.length === 0) throw new Error("No ask_first patterns loaded; refusing to run with an empty gate.");

  const files = [...new Set(readFileSync(filesFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  if (files.length === 0) throw new Error("No changed files given.");

  const askFirst = [];
  const notLowRisk = [];
  for (const f of files) {
    const hit = askFirstPatterns.find((p) => matches(f, p));
    if (hit) askFirst.push({ file: f, pattern: hit });
    if (!lowRiskPatterns.some((p) => matches(f, p))) notLowRisk.push(f);
  }

  const risk = askFirst.length ? "ask-first" : notLowRisk.length ? "standard" : "low-risk";
  writeFileSync(outFile, JSON.stringify({ risk, files, askFirst, notLowRisk, askFirstPatterns, lowRiskPatterns }, null, 2));
  console.log(risk);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
