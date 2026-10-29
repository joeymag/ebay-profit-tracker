import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type { AmazonMonthlyFeesSummary } from "@/lib/amazon/monthly-fees";

function mm(value: number): number {
  return (value * 72) / 25.4;
}

const PAGE_WIDTH = mm(210);
const PAGE_HEIGHT = mm(297);
const MARGIN_X = mm(18);
const MARGIN_TOP = mm(18);

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function drawRight(
  page: PDFPage,
  text: string,
  xRight: number,
  y: number,
  size: number,
  font: PDFFont,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: xRight - width,
    y,
    size,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
}

/**
 * Simple expense summary PDF for attaching / entering Amazon fees in QuickBooks.
 */
export async function buildAmazonMonthlyFeesPdf(
  summary: AmazonMonthlyFeesSummary,
  options?: { companyName?: string | null },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;
  const contentWidth = PAGE_WIDTH - MARGIN_X * 2;

  const ensureSpace = (needed: number) => {
    if (y - needed < mm(18)) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN_TOP;
    }
  };

  const company = options?.companyName?.trim() || "Amazon seller account";

  page.drawText(company, {
    x: MARGIN_X,
    y,
    size: 11,
    font: bold,
    color: rgb(0.15, 0.15, 0.15),
  });
  y -= mm(7);

  page.drawText("Amazon seller fees summary", {
    x: MARGIN_X,
    y,
    size: 18,
    font: bold,
    color: rgb(0.05, 0.05, 0.05),
  });
  y -= mm(8);

  page.drawText(`Period: ${summary.label}`, {
    x: MARGIN_X,
    y,
    size: 11,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= mm(5);

  page.drawText(
    `Posted ${formatDate(summary.postedAfter)} – ${formatDate(summary.postedBefore)} (UTC)`,
    {
      x: MARGIN_X,
      y,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    },
  );
  y -= mm(5);

  page.drawText(
    "Prepared for QuickBooks bookkeeping. Net seller fees from Finances (leaf fee lines only; refunds netted).",
    {
      x: MARGIN_X,
      y,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    },
  );
  y -= mm(10);

  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: MARGIN_X + contentWidth, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= mm(8);

  page.drawText("Category totals", {
    x: MARGIN_X,
    y,
    size: 12,
    font: bold,
  });
  y -= mm(7);

  page.drawText("Category", {
    x: MARGIN_X,
    y,
    size: 9,
    font: bold,
    color: rgb(0.35, 0.35, 0.35),
  });
  drawRight(page, "Lines", MARGIN_X + contentWidth - mm(40), y, 9, bold);
  drawRight(page, "Amount", MARGIN_X + contentWidth, y, 9, bold);
  y -= mm(5);

  for (const row of summary.categories) {
    ensureSpace(mm(7));
    page.drawText(row.category, {
      x: MARGIN_X,
      y,
      size: 10,
      font,
    });
    drawRight(
      page,
      String(row.lineCount),
      MARGIN_X + contentWidth - mm(40),
      y,
      10,
      font,
    );
    drawRight(
      page,
      formatMoney(row.amount, summary.currency),
      MARGIN_X + contentWidth,
      y,
      10,
      font,
    );
    y -= mm(6);
  }

  y -= mm(2);
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: MARGIN_X + contentWidth, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= mm(7);

  page.drawText("Total Amazon fees", {
    x: MARGIN_X,
    y,
    size: 12,
    font: bold,
  });
  drawRight(
    page,
    formatMoney(summary.totalFees, summary.currency),
    MARGIN_X + contentWidth,
    y,
    12,
    bold,
  );
  y -= mm(10);

  page.drawText(
    `Source: ${summary.transactionCount} Amazon finance transaction(s), ${summary.feeLineCount} fee line(s).`,
    {
      x: MARGIN_X,
      y,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    },
  );
  y -= mm(12);

  // Detail appendix (first ~80 lines to keep PDF short)
  const detailLines = summary.lines.slice(0, 80);
  if (detailLines.length) {
    ensureSpace(mm(20));
    page.drawText("Fee line detail (sample)", {
      x: MARGIN_X,
      y,
      size: 12,
      font: bold,
    });
    y -= mm(6);

    page.drawText("Date", {
      x: MARGIN_X,
      y,
      size: 8,
      font: bold,
      color: rgb(0.35, 0.35, 0.35),
    });
    page.drawText("Category / type", {
      x: MARGIN_X + mm(28),
      y,
      size: 8,
      font: bold,
      color: rgb(0.35, 0.35, 0.35),
    });
    drawRight(page, "Amount", MARGIN_X + contentWidth, y, 8, bold);
    y -= mm(5);

    for (const line of detailLines) {
      ensureSpace(mm(8));
      page.drawText(formatDate(line.postedDate), {
        x: MARGIN_X,
        y,
        size: 8,
        font,
      });
      const label = `${line.category} · ${line.breakdownType}`.slice(0, 55);
      page.drawText(label, {
        x: MARGIN_X + mm(28),
        y,
        size: 8,
        font,
      });
      drawRight(
        page,
        formatMoney(line.amount, line.currency || summary.currency),
        MARGIN_X + contentWidth,
        y,
        8,
        font,
      );
      y -= mm(4.5);
    }

    if (summary.lines.length > detailLines.length) {
      y -= mm(3);
      ensureSpace(mm(6));
      page.drawText(
        `Showing ${detailLines.length} of ${summary.lines.length} fee lines.`,
        {
          x: MARGIN_X,
          y,
          size: 8,
          font,
          color: rgb(0.4, 0.4, 0.4),
        },
      );
    }
  }

  y -= mm(14);
  ensureSpace(mm(16));
  page.drawText("QuickBooks tip", {
    x: MARGIN_X,
    y,
    size: 10,
    font: bold,
  });
  y -= mm(5);
  page.drawText(
    "Enter one expense (or journal) for Total Amazon fees, or split by category above.",
    {
      x: MARGIN_X,
      y,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
    },
  );
  y -= mm(4);
  page.drawText(
    "Suggested payee: Amazon. Attach this PDF to the expense for your records.",
    {
      x: MARGIN_X,
      y,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
    },
  );

  return doc.save();
}

export function amazonFeesPdfFilename(summary: AmazonMonthlyFeesSummary): string {
  const month = String(summary.month).padStart(2, "0");
  return `amazon-fees-${summary.year}-${month}.pdf`;
}
