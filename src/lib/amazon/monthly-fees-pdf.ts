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
  color = rgb(0.1, 0.1, 0.1),
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: xRight - width,
    y,
    size,
    font,
    color,
  });
}

type InvoiceFeeRow = {
  type: string;
  net: number;
  vatRatePct: number;
  tax: number;
  gross: number;
};

function invoiceFeeRows(summary: AmazonMonthlyFeesSummary): InvoiceFeeRow[] {
  const vatRatePct = Math.round(summary.vatRate * 100);
  return [
    {
      type: "Referral / commission",
      net: summary.sellingFeesExVat,
      vatRatePct,
      tax: summary.vatOnSellingFees,
      gross: Number(
        (summary.sellingFeesExVat + summary.vatOnSellingFees).toFixed(2),
      ),
    },
    {
      type: "Selling subscription",
      net: summary.subscriptionExVat,
      vatRatePct,
      tax: summary.vatOnSubscription,
      gross: Number(
        (summary.subscriptionExVat + summary.vatOnSubscription).toFixed(2),
      ),
    },
  ];
}

/**
 * Simple expense summary PDF for attaching / entering Amazon fees in QuickBooks.
 * Fee table mirrors eBay tax invoice style: Type / Net / VAT % / Tax.
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
  const colType = MARGIN_X;
  const colNet = MARGIN_X + contentWidth - mm(90);
  const colVat = MARGIN_X + contentWidth - mm(60);
  const colTax = MARGIN_X + contentWidth - mm(30);
  const colGross = MARGIN_X + contentWidth;

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

  page.drawText("Amazon sales & fees summary", {
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
    `Orders placed ${formatDate(summary.postedAfter)} – ${formatDate(summary.postedBefore)} (UTC)`,
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
    "Tax invoice style summary for QuickBooks. Selling fees combine commission + digital services fee.",
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

  page.drawText("Month summary", {
    x: MARGIN_X,
    y,
    size: 12,
    font: bold,
  });
  y -= mm(7);

  page.drawText(
    `Sold for inc VAT (${summary.orderCount} order${summary.orderCount === 1 ? "" : "s"})`,
    {
      x: MARGIN_X,
      y,
      size: 10,
      font,
    },
  );
  drawRight(
    page,
    formatMoney(summary.settledProductSales, summary.currency),
    colGross,
    y,
    10,
    bold,
  );
  y -= mm(6);

  page.drawText(
    `of which VAT (${Math.round(summary.vatRate * 100)}%)`,
    {
      x: MARGIN_X,
      y,
      size: 10,
      font,
    },
  );
  drawRight(
    page,
    formatMoney(summary.vatOnSales, summary.currency),
    colGross,
    y,
    10,
    bold,
  );
  y -= mm(6);

  page.drawText("Sold for (ex VAT)", {
    x: MARGIN_X,
    y,
    size: 10,
    font,
  });
  drawRight(
    page,
    formatMoney(summary.salesExVat, summary.currency),
    colGross,
    y,
    10,
    bold,
  );
  y -= mm(6);

  page.drawText("Fees paid to Amazon (inc VAT)", {
    x: MARGIN_X,
    y,
    size: 10,
    font,
  });
  drawRight(
    page,
    formatMoney(summary.totalFees, summary.currency),
    colGross,
    y,
    10,
    bold,
  );
  y -= mm(6);

  page.drawText("Left after Amazon fees", {
    x: MARGIN_X,
    y,
    size: 11,
    font: bold,
  });
  drawRight(
    page,
    formatMoney(
      summary.settledProductSales - summary.totalFees,
      summary.currency,
    ),
    colGross,
    y,
    11,
    bold,
  );
  y -= mm(12);

  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: MARGIN_X + contentWidth, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= mm(8);

  page.drawText("Fees in GBP (£)", {
    x: MARGIN_X,
    y,
    size: 12,
    font: bold,
  });
  y -= mm(7);

  const headerColor = rgb(0.35, 0.35, 0.35);
  page.drawText("Type", {
    x: colType,
    y,
    size: 9,
    font: bold,
    color: headerColor,
  });
  drawRight(page, "Net", colNet, y, 9, bold, headerColor);
  drawRight(page, "VAT (%)", colVat, y, 9, bold, headerColor);
  drawRight(page, "Tax amount", colTax, y, 9, bold, headerColor);
  drawRight(page, "Gross", colGross, y, 9, bold, headerColor);
  y -= mm(5);

  const rows = invoiceFeeRows(summary);
  for (const row of rows) {
    ensureSpace(mm(8));
    page.drawText(row.type, {
      x: colType,
      y,
      size: 10,
      font,
    });
    drawRight(
      page,
      formatMoney(row.net, summary.currency),
      colNet,
      y,
      10,
      font,
    );
    drawRight(page, row.vatRatePct.toFixed(2), colVat, y, 10, font);
    drawRight(
      page,
      formatMoney(row.tax, summary.currency),
      colTax,
      y,
      10,
      font,
    );
    drawRight(
      page,
      formatMoney(row.gross, summary.currency),
      colGross,
      y,
      10,
      bold,
    );
    y -= mm(7);
  }

  y -= mm(1);
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: MARGIN_X + contentWidth, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= mm(7);

  const netTotal = Number(
    (summary.sellingFeesExVat + summary.subscriptionExVat).toFixed(2),
  );
  const taxTotal = Number(
    (summary.vatOnSellingFees + summary.vatOnSubscription).toFixed(2),
  );

  page.drawText("Subtotal", {
    x: colType,
    y,
    size: 10,
    font: bold,
  });
  drawRight(
    page,
    formatMoney(netTotal, summary.currency),
    colNet,
    y,
    10,
    bold,
  );
  drawRight(page, "-", colVat, y, 10, font, headerColor);
  drawRight(
    page,
    formatMoney(taxTotal, summary.currency),
    colTax,
    y,
    10,
    bold,
  );
  drawRight(
    page,
    formatMoney(summary.totalFees, summary.currency),
    colGross,
    y,
    10,
    bold,
  );
  y -= mm(8);

  page.drawText("Total tax in GBP", {
    x: MARGIN_X,
    y,
    size: 10,
    font,
  });
  drawRight(
    page,
    formatMoney(taxTotal, summary.currency),
    colGross,
    y,
    10,
    bold,
  );
  y -= mm(6);

  page.drawText("Total current invoice in GBP", {
    x: MARGIN_X,
    y,
    size: 11,
    font: bold,
  });
  drawRight(
    page,
    formatMoney(summary.totalFees, summary.currency),
    colGross,
    y,
    11,
    bold,
  );
  y -= mm(12);

  page.drawText(
    `VAT at ${Math.round(summary.vatRate * 100)} %   ·   Total taxable amount: ${formatMoney(netTotal, summary.currency)}`,
    {
      x: MARGIN_X,
      y,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    },
  );
  y -= mm(10);

  page.drawText("QuickBooks tip", {
    x: MARGIN_X,
    y,
    size: 10,
    font: bold,
  });
  y -= mm(5);
  page.drawText(
    "Enter two expense lines: Referral / commission, and Selling subscription (net + VAT).",
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
