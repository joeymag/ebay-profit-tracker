import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

import { getSalesChannel } from "@/lib/orders/channel";
import { resolveLineItemSkuForDisplay } from "@/lib/orders/line-item-sku";
import { formatShippingAddressLines } from "@/lib/orders/shipping-address";
import type { StoredOrder } from "@/lib/orders/types";

/** A4 in PDF points (1pt = 1/72"). */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 28;

const ALLOWED_LABEL_HOST_SUFFIXES = [
  "shopify.com",
  "shopifycdn.com",
  "shopifycloud.com",
  "myshopify.com",
];

export function isAllowedShopifyLabelDocumentUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return ALLOWED_LABEL_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export async function fetchShopifyLabelPdfBytes(
  labelDocumentUrl: string,
): Promise<Uint8Array> {
  if (!isAllowedShopifyLabelDocumentUrl(labelDocumentUrl)) {
    throw new Error("Label document URL is not a recognized Shopify host.");
  }

  const response = await fetch(labelDocumentUrl, {
    headers: { Accept: "application/pdf,*/*" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Could not download shipping label PDF (${response.status}).`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const header = String.fromCharCode(
    bytes[0] ?? 0,
    bytes[1] ?? 0,
    bytes[2] ?? 0,
    bytes[3] ?? 0,
  );
  if (bytes.byteLength < 5 || header !== "%PDF") {
    throw new Error("Shopify label document was not a PDF.");
  }

  return bytes;
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawCheckbox(page: PDFPage, x: number, y: number, size = 10) {
  page.drawRectangle({
    x,
    y: y - size + 2,
    width: size,
    height: size,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 1,
  });
}

/** Standard Shopify Shipping label size: 4" × 6". */
const LABEL_4X6_WIDTH = 288;
const LABEL_4X6_HEIGHT = 432;

/**
 * Builds a fake 4×6" shipping-label PDF for A4 alignment tests.
 */
export async function buildTestShippingLabelPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([LABEL_4X6_WIDTH, LABEL_4X6_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.4, 0.4, 0.4);

  page.drawRectangle({
    x: 4,
    y: 4,
    width: LABEL_4X6_WIDTH - 8,
    height: LABEL_4X6_HEIGHT - 8,
    borderColor: ink,
    borderWidth: 2,
  });

  // Corner crop marks
  const mark = 18;
  for (const [x, y, dx, dy] of [
    [4, LABEL_4X6_HEIGHT - 4, 1, -1],
    [LABEL_4X6_WIDTH - 4, LABEL_4X6_HEIGHT - 4, -1, -1],
    [4, 4, 1, 1],
    [LABEL_4X6_WIDTH - 4, 4, -1, 1],
  ] as const) {
    page.drawLine({
      start: { x, y },
      end: { x: x + dx * mark, y },
      thickness: 1.5,
      color: ink,
    });
    page.drawLine({
      start: { x, y },
      end: { x, y: y + dy * mark },
      thickness: 1.5,
      color: ink,
    });
  }

  // Center crosshair
  const cx = LABEL_4X6_WIDTH / 2;
  const cy = LABEL_4X6_HEIGHT / 2;
  page.drawLine({
    start: { x: cx - 24, y: cy },
    end: { x: cx + 24, y: cy },
    thickness: 1,
    color: muted,
  });
  page.drawLine({
    start: { x: cx, y: cy - 24 },
    end: { x: cx, y: cy + 24 },
    thickness: 1,
    color: muted,
  });

  const title = "TEST SHIPPING LABEL";
  page.drawText(title, {
    x: (LABEL_4X6_WIDTH - fontBold.widthOfTextAtSize(title, 14)) / 2,
    y: LABEL_4X6_HEIGHT - 40,
    size: 14,
    font: fontBold,
    color: ink,
  });

  const sizeNote = "4 × 6 in · alignment check";
  page.drawText(sizeNote, {
    x: (LABEL_4X6_WIDTH - font.widthOfTextAtSize(sizeNote, 9)) / 2,
    y: LABEL_4X6_HEIGHT - 56,
    size: 9,
    font,
    color: muted,
  });

  page.drawText("FROM", {
    x: 16,
    y: LABEL_4X6_HEIGHT - 90,
    size: 8,
    font: fontBold,
    color: muted,
  });
  page.drawText("Your Warehouse", { x: 16, y: LABEL_4X6_HEIGHT - 104, size: 10, font });
  page.drawText("Unit 1, Sample Estate", {
    x: 16,
    y: LABEL_4X6_HEIGHT - 118,
    size: 10,
    font,
  });
  page.drawText("London, SW1A 1AA", {
    x: 16,
    y: LABEL_4X6_HEIGHT - 132,
    size: 10,
    font,
  });

  page.drawText("TO", {
    x: 16,
    y: LABEL_4X6_HEIGHT - 170,
    size: 8,
    font: fontBold,
    color: muted,
  });
  page.drawText("Test Customer", {
    x: 16,
    y: LABEL_4X6_HEIGHT - 186,
    size: 12,
    font: fontBold,
  });
  page.drawText("10 Alignment Street", {
    x: 16,
    y: LABEL_4X6_HEIGHT - 202,
    size: 11,
    font,
  });
  page.drawText("Manchester, M1 1AE", {
    x: 16,
    y: LABEL_4X6_HEIGHT - 218,
    size: 11,
    font,
  });
  page.drawText("United Kingdom", {
    x: 16,
    y: LABEL_4X6_HEIGHT - 234,
    size: 11,
    font,
  });

  // Fake barcode bars
  let bx = 24;
  const barcodeY = 48;
  for (let i = 0; i < 42; i += 1) {
    const w = i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1.2;
    page.drawRectangle({
      x: bx,
      y: barcodeY,
      width: w,
      height: 36,
      color: ink,
    });
    bx += w + 1.5;
  }

  page.drawText("TEST 0000 0000 0000", {
    x: (LABEL_4X6_WIDTH - font.widthOfTextAtSize("TEST 0000 0000 0000", 9)) / 2,
    y: 28,
    size: 9,
    font,
    color: ink,
  });

  return doc.save();
}

/**
 * Builds an A4 PDF: Shopify shipping label on the top half,
 * warehouse pick list on the bottom half.
 */
export async function buildA4LabelPickSheetPdf(
  order: StoredOrder,
  labelPdfBytes: Uint8Array,
  options?: { testMode?: boolean },
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const page = out.addPage([A4_WIDTH, A4_HEIGHT]);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold);

  const labelDoc = await PDFDocument.load(labelPdfBytes, {
    ignoreEncryption: true,
  });
  const labelPages = labelDoc.getPageIndices();
  if (labelPages.length === 0) {
    throw new Error("Shipping label PDF has no pages.");
  }

  const [embeddedLabel] = await out.embedPdf(labelDoc, [labelPages[0]]);
  const labelSize = embeddedLabel.size();

  const labelAreaTop = A4_HEIGHT - MARGIN;
  const labelAreaBottom = A4_HEIGHT * 0.48;
  const labelAreaHeight = labelAreaTop - labelAreaBottom;
  const labelAreaWidth = A4_WIDTH - MARGIN * 2;

  const scale = Math.min(
    labelAreaWidth / labelSize.width,
    labelAreaHeight / labelSize.height,
  );
  const drawWidth = labelSize.width * scale;
  const drawHeight = labelSize.height * scale;
  const labelX = MARGIN + (labelAreaWidth - drawWidth) / 2;
  const labelY = labelAreaBottom + (labelAreaHeight - drawHeight) / 2;

  page.drawPage(embeddedLabel, {
    x: labelX,
    y: labelY,
    width: drawWidth,
    height: drawHeight,
  });

  if (options?.testMode) {
    // Outline where the label sits on the A4 sheet for printer alignment.
    page.drawRectangle({
      x: labelX,
      y: labelY,
      width: drawWidth,
      height: drawHeight,
      borderColor: rgb(0.85, 0.2, 0.2),
      borderWidth: 0.75,
      borderDashArray: [4, 3],
    });
    const testBanner = "TEST PRINT — alignment only · not a real label";
    page.drawText(testBanner, {
      x:
        (A4_WIDTH - fontBold.widthOfTextAtSize(testBanner, 8)) / 2,
      y: labelAreaTop - 10,
      size: 8,
      font: fontBold,
      color: rgb(0.75, 0.15, 0.15),
    });
  }

  // Divider between label and pick list
  const pickTop = labelAreaBottom - 8;
  page.drawLine({
    start: { x: MARGIN, y: pickTop },
    end: { x: A4_WIDTH - MARGIN, y: pickTop },
    thickness: 1,
    color: rgb(0.55, 0.55, 0.55),
  });

  let y = pickTop - 18;
  const channel = getSalesChannel(order.tags);

  page.drawText(options?.testMode ? "PICK LIST (TEST)" : "PICK LIST", {
    x: MARGIN,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(order.orderNumber, {
    x: A4_WIDTH - MARGIN - fontBold.widthOfTextAtSize(order.orderNumber, 14),
    y,
    size: 14,
    font: fontBold,
  });
  y -= 16;

  const meta = [
    channel !== "Other" ? channel : null,
    order.ebayOrderId ? `eBay ${order.ebayOrderId}` : null,
    order.amazonOrderId ? `Amazon ${order.amazonOrderId}` : null,
    order.shippingCarrier || order.shippingService || null,
    order.trackingNumbers[0] ? `Track ${order.trackingNumbers[0]}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (meta) {
    page.drawText(meta.slice(0, 110), {
      x: MARGIN,
      y,
      size: 8,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 14;
  }

  page.drawText("Ship to", {
    x: MARGIN,
    y,
    size: 8,
    font: fontBold,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 12;

  const shipLines = [
    order.buyerName,
    ...formatShippingAddressLines(order.shippingAddress),
    order.shippingAddress?.phone
      ? `Tel: ${order.shippingAddress.phone}`
      : null,
  ].filter((line): line is string => Boolean(line?.trim()));

  for (const line of shipLines) {
    page.drawText(line.slice(0, 90), {
      x: MARGIN,
      y,
      size: 10,
      font,
    });
    y -= 12;
  }

  y -= 6;

  // Column headers
  const colCheck = MARGIN;
  const colQty = MARGIN + 18;
  const colSku = MARGIN + 48;
  const colTitle = MARGIN + 170;
  const titleWidth = A4_WIDTH - MARGIN - colTitle;

  page.drawText("Qty", {
    x: colQty,
    y,
    size: 8,
    font: fontBold,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText("SKU", {
    x: colSku,
    y,
    size: 8,
    font: fontBold,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText("Item", {
    x: colTitle,
    y,
    size: 8,
    font: fontBold,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 14;

  for (const item of order.lineItems) {
    if (y < MARGIN + 24) {
      page.drawText("…more items on order — check Shopify", {
        x: MARGIN,
        y,
        size: 8,
        font,
        color: rgb(0.45, 0.45, 0.45),
      });
      break;
    }

    const sku =
      resolveLineItemSkuForDisplay(item.sku, item.title, item.temuSku) || "—";
    const qty = String(item.quantity);
    const titleLines = wrapText(item.title || "Item", font, 9, titleWidth).slice(
      0,
      2,
    );
    const rowHeight = Math.max(14, titleLines.length * 11);

    drawCheckbox(page, colCheck, y, 10);
    page.drawText(qty, {
      x: colQty,
      y,
      size: 11,
      font: fontBold,
    });
    page.drawText(sku.slice(0, 28), {
      x: colSku,
      y,
      size: 9,
      font,
    });
    titleLines.forEach((line, index) => {
      page.drawText(line, {
        x: colTitle,
        y: y - index * 11,
        size: 9,
        font,
      });
    });

    y -= rowHeight + 6;
  }

  page.drawText(
    options?.testMode
      ? `TEST A4 pack sheet for ${order.orderNumber} · print at 100% scale (no fit-to-page)`
      : `Generated for ${order.orderNumber} · ${order.lineItems.reduce((sum, i) => sum + i.quantity, 0)} unit(s)`,
    {
      x: MARGIN,
      y: MARGIN - 4,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    },
  );

  return out.save();
}

/** Convenience: A4 pack sheet using a fake 4×6 label + this order's pick list. */
export async function buildTestA4PackSheetPdf(
  order: StoredOrder,
): Promise<Uint8Array> {
  const labelBytes = await buildTestShippingLabelPdfBytes();
  return buildA4LabelPickSheetPdf(order, labelBytes, { testMode: true });
}
