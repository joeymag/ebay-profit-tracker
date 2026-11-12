/**
 * Amazon listing SEO analysis helpers (Yoast-style).
 * Scores are an internal optimisation guide — not an official Amazon metric.
 * No fixed keyword-density / repetition targets.
 */

export const AMAZON_TITLE_SOFT_MAX = 190;
export const AMAZON_BACKEND_SEARCH_MAX_BYTES = 249;

export type SeoKeywordTier = "primary" | "secondary" | "long-tail";

export type SeoTargetKeyword = {
  id: string;
  phrase: string;
  tier: SeoKeywordTier;
};

export type SeoSectionKey =
  | "title"
  | "bullet1"
  | "bullet2"
  | "bullet3"
  | "bullet4"
  | "bullet5"
  | "description"
  | "backend";

export type SeoSectionMatch = {
  section: SeoSectionKey;
  exactCount: number;
  wordMatch: boolean;
};

export type SeoKeywordAnalysis = {
  keyword: SeoTargetKeyword;
  placements: SeoSectionMatch[];
  exactAnywhere: boolean;
  wordAnywhere: boolean;
  totalExact: number;
};

export type SeoTrafficLight = "green" | "amber" | "red";

export type SeoRecommendation = {
  id: string;
  severity: SeoTrafficLight;
  message: string;
};

export type SeoSectionScore = {
  key: "title" | "bullets" | "description" | "backend";
  score: number;
  max: number;
  light: SeoTrafficLight;
  notes: string[];
};

export type SeoAnalysis = {
  keywords: SeoKeywordAnalysis[];
  coverage: {
    placed: number;
    total: number;
    missing: SeoTargetKeyword[];
  };
  repetition: Array<{
    phrase: string;
    section: SeoSectionKey;
    exactCount: number;
  }>;
  backend: {
    bytesUsed: number;
    bytesRemaining: number;
    percentUsed: number;
    overLimit: boolean;
    duplicateWords: string[];
    wordsAlreadyInListing: string[];
    suggestedSynonyms: string[];
  };
  sections: SeoSectionScore[];
  overall: {
    score: number;
    max: number;
    light: SeoTrafficLight;
  };
  recommendations: SeoRecommendation[];
};

export type SeoListingContent = {
  title: string;
  bulletPoints: string[];
  description: string;
  backendSearchTerms: string;
};

const SECTION_LABELS: Record<SeoSectionKey, string> = {
  title: "Title",
  bullet1: "Bullet 1",
  bullet2: "Bullet 2",
  bullet3: "Bullet 3",
  bullet4: "Bullet 4",
  bullet5: "Bullet 5",
  description: "Description",
  backend: "Backend search terms",
};

export function seoSectionLabel(section: SeoSectionKey): string {
  return SECTION_LABELS[section];
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countExactPhrase(haystack: string, phrase: string): number {
  const trimmed = phrase.trim();
  if (!trimmed || !haystack) return 0;
  const pattern = new RegExp(escapeRegExp(trimmed), "gi");
  const matches = haystack.match(pattern);
  return matches?.length ?? 0;
}

/** True when every word in the phrase appears as a whole word in the haystack. */
export function hasWordMatch(haystack: string, phrase: string): boolean {
  const words = tokenizeWords(phrase);
  if (!words.length) return false;
  const hayTokens = new Set(tokenizeWords(haystack));
  return words.every((word) => hayTokens.has(word));
}

function sectionsFromContent(content: SeoListingContent): Record<SeoSectionKey, string> {
  const bullets = [...content.bulletPoints];
  while (bullets.length < 5) bullets.push("");
  return {
    title: content.title ?? "",
    bullet1: bullets[0] ?? "",
    bullet2: bullets[1] ?? "",
    bullet3: bullets[2] ?? "",
    bullet4: bullets[3] ?? "",
    bullet5: bullets[4] ?? "",
    description: content.description ?? "",
    backend: content.backendSearchTerms ?? "",
  };
}

function visibleListingText(content: SeoListingContent): string {
  return [
    content.title,
    ...content.bulletPoints,
    content.description,
  ].join(" ");
}

function lightForScore(score: number, max: number): SeoTrafficLight {
  if (max <= 0) return "amber";
  const ratio = score / max;
  if (ratio >= 0.8) return "green";
  if (ratio >= 0.5) return "amber";
  return "red";
}

/**
 * Lightweight synonym suggestions derived from listing words + keyword stems.
 * Not an AI thesaurus — only suggests related words already implied by content
 * or common fasteners/hardware stems when applicable.
 */
function suggestSynonyms(
  content: SeoListingContent,
  keywords: SeoTargetKeyword[],
): string[] {
  const visible = new Set(tokenizeWords(visibleListingText(content)));
  const backend = new Set(tokenizeWords(content.backendSearchTerms));
  const covered = new Set([...visible, ...backend]);

  const seeds = new Set<string>();
  for (const keyword of keywords) {
    for (const word of tokenizeWords(keyword.phrase)) {
      if (word.length >= 4) seeds.add(word);
    }
  }
  for (const word of tokenizeWords(content.title)) {
    if (word.length >= 5) seeds.add(word);
  }

  const catalog: Record<string, string[]> = {
    screw: ["woodscrew", "fastener", "selftapping"],
    screws: ["woodscrews", "fasteners", "selftapping"],
    woodscrew: ["chipboard", "countersunk", "pozi"],
    woodscrews: ["chipboard", "countersunk", "pozi"],
    bolt: ["hex", "machine", "fastener"],
    bolts: ["hex", "machine", "fasteners"],
    nut: ["nylon", "locking", "hex"],
    nuts: ["nylon", "locking", "hex"],
    hinge: ["butt", "tee", "strap"],
    hinges: ["butt", "tee", "strap"],
    stainless: ["a2", "a4", "rustproof", "corrosion"],
    galvanised: ["zinc", "plated", "outdoor"],
    galvanized: ["zinc", "plated", "outdoor"],
    black: ["epoxy", "coated"],
    pozi: ["pozidriv", "crosshead"],
    phillips: ["crosshead"],
  };

  const suggestions: string[] = [];
  for (const seed of seeds) {
    const related = catalog[seed];
    if (!related) continue;
    for (const term of related) {
      if (!covered.has(term) && !suggestions.includes(term)) {
        suggestions.push(term);
      }
    }
  }
  return suggestions.slice(0, 8);
}

function analyseKeyword(
  keyword: SeoTargetKeyword,
  sections: Record<SeoSectionKey, string>,
): SeoKeywordAnalysis {
  const placements: SeoSectionMatch[] = (
    Object.keys(sections) as SeoSectionKey[]
  ).map((section) => {
    const text = sections[section];
    return {
      section,
      exactCount: countExactPhrase(text, keyword.phrase),
      wordMatch: hasWordMatch(text, keyword.phrase),
    };
  });
  const totalExact = placements.reduce((sum, row) => sum + row.exactCount, 0);
  return {
    keyword,
    placements,
    exactAnywhere: totalExact > 0,
    wordAnywhere: placements.some((row) => row.wordMatch),
    totalExact,
  };
}

export function analyseAmazonListingSeo(
  content: SeoListingContent,
  keywords: SeoTargetKeyword[],
): SeoAnalysis {
  const cleanedKeywords = keywords
    .map((row) => ({
      ...row,
      phrase: row.phrase.trim().replace(/\s+/g, " "),
    }))
    .filter((row) => row.phrase.length > 0);

  const sections = sectionsFromContent(content);
  const analyses = cleanedKeywords.map((keyword) =>
    analyseKeyword(keyword, sections),
  );

  const missing = analyses
    .filter((row) => !row.exactAnywhere && !row.wordAnywhere)
    .map((row) => row.keyword);

  const placed = analyses.filter(
    (row) => row.exactAnywhere || row.wordAnywhere,
  ).length;

  const repetition: SeoAnalysis["repetition"] = [];
  for (const row of analyses) {
    for (const placement of row.placements) {
      // Flag heavy exact repeats in one section — informational, not a density rule.
      if (placement.exactCount >= 3) {
        repetition.push({
          phrase: row.keyword.phrase,
          section: placement.section,
          exactCount: placement.exactCount,
        });
      }
    }
  }

  const bytesUsed = utf8ByteLength(content.backendSearchTerms);
  const bytesRemaining = Math.max(0, AMAZON_BACKEND_SEARCH_MAX_BYTES - bytesUsed);
  const percentUsed = Math.min(
    100,
    Math.round((bytesUsed / AMAZON_BACKEND_SEARCH_MAX_BYTES) * 100),
  );
  const overLimit = bytesUsed > AMAZON_BACKEND_SEARCH_MAX_BYTES;

  const backendTokens = tokenizeWords(content.backendSearchTerms);
  const backendCounts = new Map<string, number>();
  for (const token of backendTokens) {
    backendCounts.set(token, (backendCounts.get(token) ?? 0) + 1);
  }
  const duplicateWords = [...backendCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([word]) => word)
    .slice(0, 12);

  const visibleTokens = new Set(tokenizeWords(visibleListingText(content)));
  const wordsAlreadyInListing = [...new Set(backendTokens)]
    .filter((word) => visibleTokens.has(word) && word.length > 2)
    .slice(0, 12);

  const suggestedSynonyms = suggestSynonyms(content, cleanedKeywords);

  // --- Section scores (no repetition quotas) ---
  const titleNotes: string[] = [];
  let titleScore = 0;
  const titleMax = 25;
  if (content.title.trim()) {
    titleScore += 6;
    titleNotes.push("+6 Title is present");
  } else {
    titleNotes.push("− Title is empty");
  }
  if (content.title.length > 0 && content.title.length <= AMAZON_TITLE_SOFT_MAX) {
    titleScore += 4;
    titleNotes.push(`+4 Length within ${AMAZON_TITLE_SOFT_MAX} characters`);
  } else if (content.title.length > AMAZON_TITLE_SOFT_MAX) {
    titleNotes.push(`− Over ${AMAZON_TITLE_SOFT_MAX} characters`);
  }
  const primary = analyses.filter((row) => row.keyword.tier === "primary");
  const primaryInTitle = primary.filter((row) =>
    row.placements.some((p) => p.section === "title" && p.exactCount > 0),
  );
  if (primary.length) {
    const gained = Math.round((primaryInTitle.length / primary.length) * 12);
    titleScore += gained;
    titleNotes.push(
      `+${gained} Primary keyword exact match in title (${primaryInTitle.length}/${primary.length})`,
    );
    if (primaryInTitle.length < primary.length) {
      titleNotes.push("− Some primary keywords missing from title");
    }
  } else {
    titleScore += 3;
    titleNotes.push("+3 No primary keywords set (neutral credit)");
  }
  titleScore = Math.min(titleMax, titleScore);

  const bulletNotes: string[] = [];
  let bulletScore = 0;
  const bulletMax = 25;
  const filledBullets = content.bulletPoints.filter((b) => b.trim()).length;
  const bulletFill = Math.round((Math.min(5, filledBullets) / 5) * 8);
  bulletScore += bulletFill;
  bulletNotes.push(`+${bulletFill} Filled bullets (${filledBullets}/5)`);

  const secondary = analyses.filter((row) => row.keyword.tier === "secondary");
  const secondaryInBullets = secondary.filter((row) =>
    row.placements.some(
      (p) => p.section.startsWith("bullet") && (p.exactCount > 0 || p.wordMatch),
    ),
  );
  if (secondary.length) {
    const gained = Math.round((secondaryInBullets.length / secondary.length) * 12);
    bulletScore += gained;
    bulletNotes.push(
      `+${gained} Secondary coverage in bullets (${secondaryInBullets.length}/${secondary.length})`,
    );
  } else {
    bulletScore += 4;
    bulletNotes.push("+4 No secondary keywords set (neutral credit)");
  }

  const longTail = analyses.filter((row) => row.keyword.tier === "long-tail");
  const longInBullets = longTail.filter((row) =>
    row.placements.some(
      (p) => p.section.startsWith("bullet") && (p.exactCount > 0 || p.wordMatch),
    ),
  );
  if (longTail.length) {
    const gained = Math.round((longInBullets.length / longTail.length) * 5);
    bulletScore += gained;
    bulletNotes.push(
      `+${gained} Long-tail coverage in bullets (${longInBullets.length}/${longTail.length})`,
    );
  }
  bulletScore = Math.min(bulletMax, bulletScore);

  const descriptionNotes: string[] = [];
  let descriptionScore = 0;
  const descriptionMax = 25;
  const descLen = content.description.trim().length;
  if (descLen > 40) {
    descriptionScore += 8;
    descriptionNotes.push("+8 Description has meaningful length");
  } else if (descLen > 0) {
    descriptionScore += 3;
    descriptionNotes.push("+3 Description is short");
  } else {
    descriptionNotes.push("− Description is empty");
  }
  const keywordsInDescription = analyses.filter((row) =>
    row.placements.some(
      (p) => p.section === "description" && (p.exactCount > 0 || p.wordMatch),
    ),
  );
  if (cleanedKeywords.length) {
    const gained = Math.round(
      (keywordsInDescription.length / cleanedKeywords.length) * 12,
    );
    descriptionScore += gained;
    descriptionNotes.push(
      `+${gained} Keyword coverage in description (${keywordsInDescription.length}/${cleanedKeywords.length})`,
    );
  } else {
    descriptionScore += 5;
    descriptionNotes.push("+5 No target keywords set (neutral credit)");
  }
  if (repetition.some((row) => row.section === "description")) {
    descriptionScore = Math.max(0, descriptionScore - 3);
    descriptionNotes.push("− Heavy exact repeats in description");
  }
  descriptionScore = Math.min(descriptionMax, descriptionScore);

  const backendNotes: string[] = [];
  let backendScore = 0;
  const backendMax = 25;
  if (bytesUsed === 0) {
    backendNotes.push("− Backend search terms are empty");
  } else if (overLimit) {
    backendNotes.push(`− Exceeds ${AMAZON_BACKEND_SEARCH_MAX_BYTES} UTF-8 bytes`);
  } else {
    backendScore += 8;
    backendNotes.push("+8 Within 249 UTF-8 byte limit");
    if (percentUsed >= 40 && percentUsed <= 95) {
      backendScore += 6;
      backendNotes.push("+6 Healthy byte utilisation");
    } else if (percentUsed < 40) {
      backendScore += 2;
      backendNotes.push("+2 Low utilisation — unused capacity");
    } else {
      backendScore += 4;
      backendNotes.push("+4 Near capacity");
    }
  }
  if (duplicateWords.length === 0 && bytesUsed > 0) {
    backendScore += 4;
    backendNotes.push("+4 No duplicate backend words");
  } else if (duplicateWords.length) {
    backendNotes.push(`− Duplicate backend words: ${duplicateWords.slice(0, 4).join(", ")}`);
  }
  if (wordsAlreadyInListing.length === 0 && bytesUsed > 0) {
    backendScore += 4;
    backendNotes.push("+4 Backend words not already used on-page");
  } else if (wordsAlreadyInListing.length) {
    backendScore = Math.max(0, backendScore - 2);
    backendNotes.push(
      `− Backend repeats on-page words: ${wordsAlreadyInListing.slice(0, 4).join(", ")}`,
    );
  }
  if (suggestedSynonyms.length && bytesRemaining > 8 && !overLimit) {
    backendNotes.push(
      `Opportunity: unused capacity for synonyms (${suggestedSynonyms.slice(0, 3).join(", ")})`,
    );
  }
  backendScore = Math.min(backendMax, Math.max(0, backendScore));

  const sectionScores: SeoSectionScore[] = [
    {
      key: "title",
      score: titleScore,
      max: titleMax,
      light: lightForScore(titleScore, titleMax),
      notes: titleNotes,
    },
    {
      key: "bullets",
      score: bulletScore,
      max: bulletMax,
      light: lightForScore(bulletScore, bulletMax),
      notes: bulletNotes,
    },
    {
      key: "description",
      score: descriptionScore,
      max: descriptionMax,
      light: lightForScore(descriptionScore, descriptionMax),
      notes: descriptionNotes,
    },
    {
      key: "backend",
      score: backendScore,
      max: backendMax,
      light: lightForScore(backendScore, backendMax),
      notes: backendNotes,
    },
  ];

  const overallScore = sectionScores.reduce((sum, row) => sum + row.score, 0);
  const overallMax = sectionScores.reduce((sum, row) => sum + row.max, 0);

  const recommendations: SeoRecommendation[] = [];
  for (const row of primary) {
    const inTitle = row.placements.some(
      (p) => p.section === "title" && p.exactCount > 0,
    );
    if (!inTitle) {
      recommendations.push({
        id: `primary-title-${row.keyword.id}`,
        severity: "red",
        message: `Primary keyword “${row.keyword.phrase}” missing from title.`,
      });
    }
  }
  for (const row of secondary) {
    const inBullets = row.placements.some(
      (p) => p.section.startsWith("bullet") && (p.exactCount > 0 || p.wordMatch),
    );
    if (!inBullets) {
      recommendations.push({
        id: `secondary-bullets-${row.keyword.id}`,
        severity: "amber",
        message: `Secondary keyword “${row.keyword.phrase}” missing from bullet points.`,
      });
    }
  }
  for (const kw of missing) {
    recommendations.push({
      id: `missing-${kw.id}`,
      severity: kw.tier === "primary" ? "red" : "amber",
      message: `Keyword “${kw.phrase}” not found anywhere in the listing.`,
    });
  }
  for (const row of repetition) {
    recommendations.push({
      id: `repeat-${row.phrase}-${row.section}`,
      severity: "amber",
      message: `Unnecessary repetition: “${row.phrase}” appears ${row.exactCount}× in ${seoSectionLabel(row.section)}.`,
    });
  }
  if (overLimit) {
    recommendations.push({
      id: "backend-over",
      severity: "red",
      message: `Backend search terms exceed the ${AMAZON_BACKEND_SEARCH_MAX_BYTES}-byte limit (${bytesUsed} bytes used).`,
    });
  } else if (bytesUsed > 0 && percentUsed < 40) {
    recommendations.push({
      id: "backend-under",
      severity: "amber",
      message: "Backend search terms have unused capacity.",
    });
  }
  if (duplicateWords.length) {
    recommendations.push({
      id: "backend-dupes",
      severity: "amber",
      message: `Remove duplicate backend words: ${duplicateWords.slice(0, 6).join(", ")}.`,
    });
  }
  if (wordsAlreadyInListing.length) {
    recommendations.push({
      id: "backend-overlap",
      severity: "amber",
      message: `Backend repeats words already in title/bullets/description: ${wordsAlreadyInListing.slice(0, 6).join(", ")}.`,
    });
  }
  for (const synonym of suggestedSynonyms.slice(0, 3)) {
    recommendations.push({
      id: `synonym-${synonym}`,
      severity: "green",
      message: `Relevant synonym/search phrase to consider: “${synonym}”.`,
    });
  }
  if (!cleanedKeywords.length) {
    recommendations.push({
      id: "no-keywords",
      severity: "amber",
      message: "Add target keywords to unlock placement tracking and coverage scoring.",
    });
  }

  return {
    keywords: analyses,
    coverage: {
      placed,
      total: cleanedKeywords.length,
      missing,
    },
    repetition,
    backend: {
      bytesUsed,
      bytesRemaining,
      percentUsed,
      overLimit,
      duplicateWords,
      wordsAlreadyInListing,
      suggestedSynonyms,
    },
    sections: sectionScores,
    overall: {
      score: overallScore,
      max: overallMax,
      light: lightForScore(overallScore, overallMax),
    },
    recommendations: recommendations.slice(0, 14),
  };
}

/** Highlight exact keyword phrases in text for preview (returns HTML-safe segments). */
export function highlightExactMatches(
  text: string,
  phrases: string[],
): Array<{ text: string; matched: boolean }> {
  const cleaned = phrases.map((p) => p.trim()).filter(Boolean);
  if (!text || !cleaned.length) return [{ text, matched: false }];

  const unique = [...new Set(cleaned)].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(${unique.map(escapeRegExp).join("|")})`,
    "gi",
  );
  const parts = text.split(pattern);
  return parts.filter(Boolean).map((part) => ({
    text: part,
    matched: unique.some((phrase) => phrase.toLowerCase() === part.toLowerCase()),
  }));
}
