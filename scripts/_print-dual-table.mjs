import { readFileSync, writeFileSync } from "fs";

const j = JSON.parse(
  readFileSync("scripts/debug-amazon-dual-reprice-live.clean.json", "utf8"),
);

function m(n) {
  return n == null ? "—" : `£${Number(n).toFixed(2)}`;
}

const lines = [
  "| SKU | Std now | Buy Box | Have BB | Std → (£0.02) | Old → | vs old | Biz now | Biz → |",
  "|---|---:|---:|---|---:|---:|---|---:|---:|",
];

for (const r of j.rows) {
  lines.push(
    `| ${[
      r.sku,
      m(r.standardCurrent),
      m(r.buyBox),
      r.youHaveBuyBox === true
        ? "yes"
        : r.youHaveBuyBox === false
          ? "no"
          : "—",
      m(r.standardSuggestedNew02),
      m(r.standardSuggestedOld),
      r.wouldChangeVsOldSharedLogic ? "DIFF" : "same",
      m(r.businessCurrent),
      m(r.businessSuggested),
    ].join(" | ")} |`,
  );
}

writeFileSync("scripts/debug-amazon-dual-reprice-live.table.md", lines.join("\n"));
process.stdout.write(
  JSON.stringify(
    {
      processed: j.processed,
      diff: j.wouldChangeVsOldCount,
      stdMoves: j.wouldChangeListedStandardCount,
      bizMoves: j.businessWouldChangeListedCount,
    },
    null,
    2,
  ) + "\n",
);
