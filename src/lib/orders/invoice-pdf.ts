import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import { getSalesChannel } from "@/lib/orders/channel";
import { resolveLineItemSkuForDisplay } from "@/lib/orders/line-item-sku";
import type { PackSheetCompanyInfo } from "@/lib/orders/pack-sheet-company";
import { formatShippingAddressLines } from "@/lib/orders/shipping-address";
import type { StoredOrder } from "@/lib/orders/types";

function mm(value: number): number {
  return (value * 72) / 25.4;
}

const PAGE_WIDTH = mm(210);
const PAGE_HEIGHT = mm(297);
const MARGIN_X = mm(18);
const MARGIN_TOP = mm(18);

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = words[0]!;

  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

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
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function drawRightText(
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

export type InvoiceCompanyInfo = PackSheetCompanyInfo & {
  vatNumber: string | null;
};

export function getInvoiceVatNumber(): string | null {
  const value = process.env.INVOICE_VAT_NUMBER?.trim();
  return value || null;
}

/**
 * Customer-facing order invoice PDF (no internal costs or profit).
 */
export async function buildOrderInvoicePdf(
  order: StoredOrder,
  company: InvoiceCompanyInfo,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.82, 0.82, 0.82);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const companyName = company.name?.trim() || "Invoice";
  page.drawText(companyName, {
    x: MARGIN_X,
    y,
    size: 16,
    font: fontBold,
    color: ink,
  });
  y -= 16;

  for (const addressLine of company.addressLines) {
    page.drawText(addressLine, {
      x: MARGIN_X,
      y,
      size: 9,
      font,
      color: muted,
    });
    y -= 12;
  }

  if (company.website) {
    page.drawText(company.website, {
      x: MARGIN_X,
      y,
      size: 9,
      font,
      color: muted,
    });
    y -= 12;
  }

  if (company.vatNumber) {
    page.drawText(`VAT number: ${company.vatNumber}`, {
      x: MARGIN_X,
      y,
      size: 9,
      font,
      color: muted,
    });
    y -= 12;
  }

  y -= 8;
  page.drawText("INVOICE", {
    x: MARGIN_X,
    y,
    size: 20,
    font: fontBold,
    color: ink,
  });
  y -= 22;

  const channel = getSalesChannel(order.tags);
  const metaLeft = [
    `Invoice number: ${order.orderNumber}`,
    `Order date: ${formatDate(order.createdAt)}`,
    `Sales channel: ${channel}`,
  ];
  if (order.ebayOrderId) {
    metaLeft.push(`eBay order: ${order.ebayOrderId}`);
  }
  if (order.amazonOrderId) {
    metaLeft.push(`Amazon order: ${order.amazonOrderId}`);
  }

  for (const row of metaLeft) {
    page.drawText(row, {
      x: MARGIN_X,
      y,
      size: 10,
      font,
      color: ink,
    });
    y -= 14;
  }

  y -= 10;
  page.drawText("Bill to / Ship to", {
    x: MARGIN_X,
    y,
    size: 10,
    font: fontBold,
    color: ink,
  });
  y -= 14;

  const buyer = order.buyerName?.trim() || "Customer";
  page.drawText(buyer, {
    x: MARGIN_X,
    y,
    size: 10,
    font,
    color: ink,
  });
  y -= 13;

  for (const addressLine of formatShippingAddressLines(order.shippingAddress)) {
    page.drawText(addressLine, {
      x: MARGIN_X,
      y,
      size: 10,
      font,
      color: ink,
    });
    y -= 13;
  }

  y -= 12;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 1,
    color: line,
  });
  y -= 18;

  const colQty = MARGIN_X;
  const colSku = MARGIN_X + mm(14);
  const colItem = MARGIN_X + mm(48);
  const colUnit = PAGE_WIDTH - MARGIN_X - mm(55);
  const colTotal = PAGE_WIDTH - MARGIN_X;
  const itemWidth = colUnit - colItem - mm(4);

  page.drawText("Qty", {
    x: colQty,
    y,
    size: 9,
    font: fontBold,
    color: muted,
  });
  page.drawText("SKU", {
    x: colSku,
    y,
    size: 9,
    font: fontBold,
    color: muted,
  });
  page.drawText("Item", {
    x: colItem,
    y,
    size: 9,
    font: fontBold,
    color: muted,
  });
  drawRightText(page, "Unit price", colUnit + mm(22), y, 9, fontBold, muted);
  drawRightText(page, "Line total", colTotal, y, 9, fontBold, muted);
  y -= 8;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.75,
    color: line,
  });
  y -= 14;

  for (const item of order.lineItems) {
    if (y < mm(55)) {
      page.drawText("Continued on next page…", {
        x: MARGIN_X,
        y,
        size: 9,
        font,
        color: muted,
      });
      break;
    }

    const sku =
      resolveLineItemSkuForDisplay(item.sku, item.title, item.temuSku) || "—";
    const titleLines = wrapText(item.title, font, 9, itemWidth);
    const unit = formatMoney(item.price, order.currency);
    const lineTotal = formatMoney(item.price * item.quantity, order.currency);
    const rowTop = y;

    page.drawText(String(item.quantity), {
      x: colQty,
      y: rowTop,
      size: 9,
      font,
      color: ink,
    });
    page.drawText(sku.slice(0, 22), {
      x: colSku,
      y: rowTop,
      size: 8,
      font,
      color: ink,
    });

    titleLines.slice(0, 3).forEach((titleLine, index) => {
      page.drawText(titleLine, {
        x: colItem,
        y: rowTop - index * 11,
        size: 9,
        font,
        color: ink,
      });
    });

    drawRightText(page, unit, colUnit + mm(22), rowTop, 9, font, ink);
    drawRightText(page, lineTotal, colTotal, rowTop, 9, font, ink);

    y -= Math.max(16, titleLines.slice(0, 3).length * 11 + 6);
  }

  y -= 6;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.75,
    color: line,
  });
  y -= 18;

  const totals: Array<{ label: string; value: number; bold?: boolean }> = [
    { label: "Subtotal", value: order.subtotal },
  ];
  if (order.shippingCharged > 0) {
    totals.push({ label: "Shipping", value: order.shippingCharged });
  }
  if (order.tax > 0) {
    totals.push({ label: "Tax / VAT", value: order.tax });
  }
  totals.push({ label: "Total", value: order.revenue, bold: true });

  for (const row of totals) {
    const labelFont = row.bold ? fontBold : font;
    const valueFont = row.bold ? fontBold : font;
    page.drawText(row.label, {
      x: colUnit - mm(10),
      y,
      size: row.bold ? 11 : 10,
      font: labelFont,
      color: ink,
    });
    drawRightText(
      page,
      formatMoney(row.value, order.currency),
      colTotal,
      y,
      row.bold ? 11 : 10,
      valueFont,
      ink,
    );
    y -= row.bold ? 18 : 15;
  }

  y -= 16;
  page.drawText(
    "This invoice is issued for your records. Payment was taken through the sales channel shown above.",
    {
      x: MARGIN_X,
      y,
      size: 8,
      font,
      color: muted,
    },
  );

  return doc.save();
}
