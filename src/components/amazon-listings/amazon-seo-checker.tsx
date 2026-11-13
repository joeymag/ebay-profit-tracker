"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AMAZON_BACKEND_SEARCH_MAX_BYTES,
  AMAZON_TITLE_SOFT_MAX,
  analyseAmazonListingSeo,
  highlightExactMatches,
  seoSectionLabel,
  type SeoKeywordTier,
  type SeoTargetKeyword,
  type SeoTrafficLight,
  utf8ByteLength,
} from "@/lib/amazon/seo-checker";
import { cn } from "@/lib/utils";

type AmazonSeoCheckerProps = {
  sku: string;
  title: string;
  bulletPoints: string[];
  description: string;
  backendSearchTerms: string;
  onApplyTitle?: (title: string) => void;
  onApplyBackendSearchTerms?: (value: string) => void;
};

type RewriteField = "title" | "backend";

type RewriteResponse =
  | { ok: true; field: RewriteField; rewrittenText: string; bytesUsed?: number }
  | { ok: false; error: string; code?: string; details?: string };

function rewriteFieldForIssue(issueId: string): RewriteField | null {
  if (issueId.startsWith("primary-title-")) return "title";
  if (
    issueId === "backend-over" ||
    issueId === "backend-dupes" ||
    issueId === "backend-overlap" ||
    issueId === "backend-under"
  ) {
    return "backend";
  }
  return null;
}

const TIER_OPTIONS: Array<{ value: SeoKeywordTier; label: string }> = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "long-tail", label: "Long-tail" },
];

const SECTION_ORDER = [
  "title",
  "bullet1",
  "bullet2",
  "bullet3",
  "bullet4",
  "bullet5",
  "description",
  "backend",
] as const;

function storageKey(sku: string) {
  return `amazon-seo-checker:keywords:${sku}`;
}

function loadKeywords(sku: string): SeoTargetKeyword[] {
  if (typeof window === "undefined" || !sku) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(sku));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SeoTargetKeyword[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row.phrase === "string")
      .map((row) => ({
        id: row.id || crypto.randomUUID(),
        phrase: row.phrase,
        tier:
          row.tier === "primary" ||
          row.tier === "secondary" ||
          row.tier === "long-tail"
            ? row.tier
            : "secondary",
      }));
  } catch {
    return [];
  }
}

function lightClass(light: SeoTrafficLight): string {
  if (light === "green") {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  }
  if (light === "amber") {
    return "bg-amber-500/15 text-amber-800 dark:text-amber-400";
  }
  return "bg-destructive/10 text-destructive";
}

function Dot({ light }: { light: SeoTrafficLight }) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        light === "green" && "bg-emerald-500",
        light === "amber" && "bg-amber-500",
        light === "red" && "bg-destructive",
      )}
      aria-hidden
    />
  );
}

function cellMark(exact: number, word: boolean): string {
  if (exact > 0) return String(exact);
  if (word) return "≈";
  return "—";
}

export function AmazonSeoChecker({
  sku,
  title,
  bulletPoints,
  description,
  backendSearchTerms,
  onApplyTitle,
  onApplyBackendSearchTerms,
}: AmazonSeoCheckerProps) {
  const [keywords, setKeywords] = useState<SeoTargetKeyword[]>([]);
  const [draftPhrase, setDraftPhrase] = useState("");
  const [draftTier, setDraftTier] = useState<SeoKeywordTier>("primary");
  const [pasteBuffer, setPasteBuffer] = useState("");
  const [rewritingId, setRewritingId] = useState<string | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  useEffect(() => {
    setKeywords(loadKeywords(sku));
  }, [sku]);

  useEffect(() => {
    if (!sku) return;
    try {
      window.localStorage.setItem(storageKey(sku), JSON.stringify(keywords));
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }, [keywords, sku]);

  const analysis = useMemo(
    () =>
      analyseAmazonListingSeo(
        { title, bulletPoints, description, backendSearchTerms },
        keywords,
      ),
    [title, bulletPoints, description, backendSearchTerms, keywords],
  );

  const highlightPhrases = keywords.map((row) => row.phrase);

  const addKeyword = (phrase: string, tier: SeoKeywordTier) => {
    const cleaned = phrase.trim().replace(/\s+/g, " ");
    if (!cleaned) return;
    setKeywords((current) => {
      if (
        current.some(
          (row) => row.phrase.toLowerCase() === cleaned.toLowerCase(),
        )
      ) {
        return current;
      }
      return [
        ...current,
        { id: crypto.randomUUID(), phrase: cleaned, tier },
      ];
    });
  };

  const addFromInput = () => {
    addKeyword(draftPhrase, draftTier);
    setDraftPhrase("");
  };

  const addFromPaste = () => {
    const lines = pasteBuffer
      .split(/[\n,;]+/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) addKeyword(line, draftTier);
    setPasteBuffer("");
  };

  const rewriteField = async (
    field: RewriteField,
    issueId: string,
    issueMessage: string,
  ) => {
    const text = field === "title" ? title : backendSearchTerms;
    if (!text.trim()) {
      setRewriteError(`Nothing to rewrite — ${field} is empty.`);
      return;
    }
    if (field === "title" && !onApplyTitle) return;
    if (field === "backend" && !onApplyBackendSearchTerms) return;

    setRewritingId(issueId);
    setRewriteError(null);
    try {
      const relatedIssues = analysis.recommendations.filter(
        (row) => rewriteFieldForIssue(row.id) === field,
      );
      const res = await fetch("/api/amazon/seo/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          text,
          issueIds: relatedIssues.map((row) => row.id),
          issues: relatedIssues.map((row) => row.message),
          keywords: keywords.map((row) => ({
            phrase: row.phrase,
            tier: row.tier,
          })),
          context:
            field === "backend"
              ? { title, bullets: bulletPoints, description }
              : undefined,
        }),
      });
      const json = (await res.json()) as RewriteResponse;
      if (!json.ok) {
        setRewriteError(json.error || "Rewrite failed.");
        return;
      }
      if (json.field === "title") onApplyTitle?.(json.rewrittenText);
      else onApplyBackendSearchTerms?.(json.rewrittenText);
    } catch {
      setRewriteError("Could not reach the SEO rewrite API.");
    } finally {
      setRewritingId(null);
    }
  };

  const backendBytes = utf8ByteLength(backendSearchTerms);
  const titleOverLimit = title.length > AMAZON_TITLE_SOFT_MAX;

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              Amazon SEO Checker
            </h2>
            <Badge variant="outline" className="font-normal">
              Internal score
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Yoast-style keyword coverage for this listing. Not an official
            Amazon score — no fixed density targets.
          </p>
        </div>
        <div
          className={cn(
            "flex min-w-[5.5rem] flex-col items-center rounded-xl px-3 py-2",
            lightClass(analysis.overall.light),
          )}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Dot light={analysis.overall.light} />
            SEO
          </div>
          <p className="text-2xl font-semibold tabular-nums leading-none">
            {analysis.overall.score}
            <span className="text-sm font-medium opacity-70">
              /{analysis.overall.max}
            </span>
          </p>
        </div>
      </div>

      {/* Keyword input */}
      <div className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-3">
        <p className="text-xs font-medium text-foreground">Target keywords</p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={draftPhrase}
            onChange={(event) => setDraftPhrase(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addFromInput();
              }
            }}
            placeholder="Add a keyword or phrase"
            className="h-9 min-w-[12rem] flex-1"
          />
          <select
            value={draftTier}
            onChange={(event) =>
              setDraftTier(event.target.value as SeoKeywordTier)
            }
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            {TIER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="outline" onClick={addFromInput}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        <textarea
          value={pasteBuffer}
          onChange={(event) => setPasteBuffer(event.target.value)}
          rows={2}
          placeholder="Or paste a list (comma / newline separated)"
          className="flex min-h-14 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {pasteBuffer.trim() ? (
          <Button type="button" size="sm" variant="secondary" onClick={addFromPaste}>
            Import pasted keywords as {draftTier}
          </Button>
        ) : null}
        {keywords.length ? (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {keywords.map((keyword) => (
              <li key={keyword.id}>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 py-0.5 pr-1 pl-2 text-xs">
                  <span className="capitalize text-muted-foreground">
                    {keyword.tier}
                  </span>
                  <span className="font-medium">{keyword.phrase}</span>
                  <button
                    type="button"
                    className="inline-flex size-5 items-center justify-center rounded-full hover:bg-muted"
                    aria-label={`Remove ${keyword.phrase}`}
                    onClick={() =>
                      setKeywords((current) =>
                        current.filter((row) => row.id !== keyword.id),
                      )
                    }
                  >
                    <X className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No keywords yet — add primary, secondary, and long-tail terms.
          </p>
        )}
      </div>

      {/* Coverage table */}
      <div className="space-y-2 overflow-x-auto">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">Keyword placement</p>
          <p className="text-xs text-muted-foreground">
            Exact count · ≈ word match · — missing ·{" "}
            {analysis.coverage.placed}/{analysis.coverage.total} covered
          </p>
        </div>
        {analysis.keywords.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Placement table appears once keywords are added.
          </p>
        ) : (
          <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Keyword</th>
                <th className="py-1.5 pr-2 font-medium">Tier</th>
                {SECTION_ORDER.map((section) => (
                  <th
                    key={section}
                    className="px-1 py-1.5 text-center font-medium"
                    title={seoSectionLabel(section)}
                  >
                    {section === "title"
                      ? "T"
                      : section === "description"
                        ? "D"
                        : section === "backend"
                          ? "B"
                          : section.replace("bullet", "B")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.keywords.map((row) => (
                <tr
                  key={row.keyword.id}
                  className="border-b border-border/40 last:border-0"
                >
                  <td className="py-1.5 pr-2 font-medium">{row.keyword.phrase}</td>
                  <td className="py-1.5 pr-2 capitalize text-muted-foreground">
                    {row.keyword.tier}
                  </td>
                  {SECTION_ORDER.map((section) => {
                    const placement = row.placements.find(
                      (entry) => entry.section === section,
                    );
                    const mark = cellMark(
                      placement?.exactCount ?? 0,
                      placement?.wordMatch ?? false,
                    );
                    return (
                      <td
                        key={section}
                        className={cn(
                          "px-1 py-1.5 text-center tabular-nums",
                          mark !== "—"
                            ? "font-semibold text-emerald-700 dark:text-emerald-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {mark}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Backend byte meter */}
      <div className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium">Backend search terms (UTF-8)</p>
          <p
            className={cn(
              "text-xs tabular-nums",
              analysis.backend.overLimit
                ? "font-medium text-destructive"
                : "text-muted-foreground",
            )}
          >
            {analysis.backend.bytesUsed}/{AMAZON_BACKEND_SEARCH_MAX_BYTES} bytes
            {" · "}
            {analysis.backend.bytesRemaining} free
            {" · "}
            {analysis.backend.percentUsed}%
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              analysis.backend.overLimit
                ? "bg-destructive"
                : analysis.backend.percentUsed >= 85
                  ? "bg-amber-500"
                  : "bg-emerald-500",
            )}
            style={{
              width: `${Math.min(100, analysis.backend.percentUsed)}%`,
            }}
          />
        </div>
        {analysis.backend.duplicateWords.length ? (
          <p className="text-xs text-amber-800 dark:text-amber-400">
            Duplicate words: {analysis.backend.duplicateWords.join(", ")}
          </p>
        ) : null}
        {analysis.backend.wordsAlreadyInListing.length ? (
          <p className="text-xs text-amber-800 dark:text-amber-400">
            Already on-page: {analysis.backend.wordsAlreadyInListing.join(", ")}
          </p>
        ) : null}
        {analysis.backend.suggestedSynonyms.length ? (
          <p className="text-xs text-muted-foreground">
            Suggested synonyms/phrases:{" "}
            {analysis.backend.suggestedSynonyms.join(", ")}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          Live field uses {backendBytes} UTF-8 bytes right now.
        </p>
      </div>

      {/* Section scores */}
      <div className="grid gap-2 sm:grid-cols-2">
        {analysis.sections.map((section) => (
          <div
            key={section.key}
            className="rounded-xl border border-border/60 bg-background/70 p-3"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium capitalize">
                <Dot light={section.light} />
                {section.key}
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {section.score}/{section.max}
              </span>
            </div>
            <ul className="space-y-0.5">
              {section.notes.slice(0, 4).map((note) => (
                <li key={note} className="text-[11px] leading-snug text-muted-foreground">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Highlighted snippets */}
      {highlightPhrases.length ? (
        <div className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-3">
          <p className="text-xs font-medium">Highlighted listing text</p>
          {(
            [
              ["Title", title],
              ["Description", description],
              ["Backend", backendSearchTerms],
            ] as const
          ).map(([label, text]) => (
            <div key={label} className="space-y-0.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                {label}
              </p>
              <p className="text-xs leading-relaxed">
                {highlightExactMatches(text || "—", highlightPhrases).map(
                  (part, index) => (
                    <span
                      key={`${label}-${index}`}
                      className={
                        part.matched
                          ? "rounded bg-amber-200/80 px-0.5 font-medium text-amber-950 dark:bg-amber-500/30 dark:text-amber-100"
                          : undefined
                      }
                    >
                      {part.text}
                    </span>
                  ),
                )}
              </p>
            </div>
          ))}
          <div className="space-y-0.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Bullets
            </p>
            <ul className="space-y-1">
              {bulletPoints.map((bullet, index) => (
                <li key={`hl-bullet-${index}`} className="text-xs leading-relaxed">
                  <span className="mr-1 text-muted-foreground">{index + 1}.</span>
                  {highlightExactMatches(bullet || "—", highlightPhrases).map(
                    (part, partIndex) => (
                      <span
                        key={`hl-bullet-${index}-${partIndex}`}
                        className={
                          part.matched
                            ? "rounded bg-amber-200/80 px-0.5 font-medium text-amber-950 dark:bg-amber-500/30 dark:text-amber-100"
                            : undefined
                        }
                      >
                        {part.text}
                      </span>
                    ),
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Recommendations */}
      <div className="space-y-2">
        <p className="text-xs font-medium">Recommendations</p>
        {rewriteError ? (
          <p className="text-xs font-medium text-destructive">{rewriteError}</p>
        ) : null}
        <ul className="space-y-1.5">
          {titleOverLimit ? (
            <li className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-2 text-xs leading-snug">
              <div className="flex min-w-0 items-start gap-2">
                <Dot light="red" />
                <span>
                  Title exceeds {AMAZON_TITLE_SOFT_MAX} characters (
                  {title.length}).
                </span>
              </div>
              {onApplyTitle ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  disabled={rewritingId != null}
                  onClick={() =>
                    void rewriteField(
                      "title",
                      "title-over-length",
                      `Title exceeds ${AMAZON_TITLE_SOFT_MAX} characters.`,
                    )
                  }
                >
                  {rewritingId === "title-over-length" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Rewrite title
                </Button>
              ) : null}
            </li>
          ) : null}
          {analysis.recommendations.map((item) => {
            const field = rewriteFieldForIssue(item.id);
            const canRewrite =
              (field === "title" && onApplyTitle) ||
              (field === "backend" && onApplyBackendSearchTerms);
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-2 text-xs leading-snug"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Dot light={item.severity} />
                  <span>{item.message}</span>
                </div>
                {canRewrite && field ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0"
                    disabled={rewritingId != null}
                    onClick={() => void rewriteField(field, item.id, item.message)}
                  >
                    {rewritingId === item.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    Rewrite {field === "title" ? "title" : "backend"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Rewrite with Claude applies into the editor draft only — use Save to
          Amazon when you are happy. Requires ANTHROPIC_API_KEY on the server.
        </p>
      </div>
    </section>
  );
}
