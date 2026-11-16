/**
 * Pulls amazon_reprice_rules via Supabase SQL over the Management API is unavailable
 * locally without a service role. Instead this script accepts rules JSON on stdin
 * or from LIVE_RULES_JSON and writes scripts/live-amazon-reprice-rules.json.
 */
import { readFileSync, writeFileSync } from "fs";

const fromArg = process.argv[2];
const raw = fromArg
  ? readFileSync(fromArg, "utf8")
  : readFileSync(0, "utf8");
const parsed = JSON.parse(raw);
const rules = Array.isArray(parsed) ? parsed : parsed.rules;
if (!Array.isArray(rules) || rules.length === 0) {
  throw new Error("Expected a non-empty rules array");
}
writeFileSync(
  "scripts/live-amazon-reprice-rules.json",
  JSON.stringify(rules, null, 2),
);
console.log(`Wrote ${rules.length} rules`);
