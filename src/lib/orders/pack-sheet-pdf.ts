import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

import type { PackSheetCompanyInfo } from "@/lib/orders/pack-sheet-company";
import { getSalesChannel } from "@/lib/orders/channel";
import { resolveLineItemSkuForDisplay } from "@/lib/orders/line-item-sku";
import { formatShippingAddressLines } from "@/lib/orders/shipping-address";
import type { StoredOrder } from "@/lib/orders/types";

/** mm → PDF points (1pt = 1/72"). */
function mm(value: number): number {
  return (value * 72) / 25.4;
}

/**
 * Royal Mail Click & Drop S19 Integrated Labels (A4).
 * Label peel zone at the bottom; pick list in the integrated area above the perforation.
 * Spec: 160×105mm label, 25mm side margins, 8mm bottom, perforation at 123mm from bottom.
 */
const A4_WIDTH = mm(210);
const A4_HEIGHT = mm(297);
const S19_LABEL_WIDTH = mm(160);
const S19_LABEL_HEIGHT = mm(105);
const S19_LABEL_LEFT = mm(25);
const S19_LABEL_BOTTOM = mm(8);
const S19_PERFORATION_FROM_BOTTOM = mm(123);
const PICK_MARGIN_X = mm(12);
const PICK_MARGIN_TOP = mm(12);
const PICK_MARGIN_BOTTOM = mm(8);

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

/**
 * Fake label matching the S19 adhesive size (160 × 105mm) for alignment tests.
 */
export async function buildTestShippingLabelPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([S19_LABEL_WIDTH, S19_LABEL_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.4, 0.4, 0.4);

  page.drawRectangle({
    x: 3,
    y: 3,
    width: S19_LABEL_WIDTH - 6,
    height: S19_LABEL_HEIGHT - 6,
    borderColor: ink,
    borderWidth: 2,
  });

  const mark = 14;
  for (const [x, y, dx, dy] of [
    [3, S19_LABEL_HEIGHT - 3, 1, -1],
    [S19_LABEL_WIDTH - 3, S19_LABEL_HEIGHT - 3, -1, -1],
    [3, 3, 1, 1],
    [S19_LABEL_WIDTH - 3, 3, -1, 1],
  ] as const) {
    page.drawLine({
      start: { x, y },
      end: { x: x + dx * mark, y },
      thickness: 1.25,
      color: ink,
    });
    page.drawLine({
      start: { x, y },
      end: { x, y: y + dy * mark },
      thickness: 1.25,
      color: ink,
    });
  }

  const cx = S19_LABEL_WIDTH / 2;
  const cy = S19_LABEL_HEIGHT / 2;
  page.drawLine({
    start: { x: cx - 20, y: cy },
    end: { x: cx + 20, y: cy },
    thickness: 1,
    color: muted,
  });
  page.drawLine({
    start: { x: cx, y: cy - 20 },
    end: { x: cx, y: cy + 20 },
    thickness: 1,
    color: muted,
  });

  const title = "TEST S19 LABEL";
  page.drawText(title, {
    x: (S19_LABEL_WIDTH - fontBold.widthOfTextAtSize(title, 13)) / 2,
    y: S19_LABEL_HEIGHT - 28,
    size: 13,
    font: fontBold,
    color: ink,
  });

  const sizeNote = "160 × 105 mm · Royal Mail S19 peel zone";
  page.drawText(sizeNote, {
    x: (S19_LABEL_WIDTH - font.widthOfTextAtSize(sizeNote, 8)) / 2,
    y: S19_LABEL_HEIGHT - 42,
    size: 8,
    font,
    color: muted,
  });

  page.drawText("FROM", {
    x: 14,
    y: S19_LABEL_HEIGHT - 68,
    size: 7,
    font: fontBold,
    color: muted,
  });
  page.drawText("Your Warehouse", {
    x: 14,
    y: S19_LABEL_HEIGHT - 80,
    size: 9,
    font,
  });
  page.drawText("Unit 1, Sample Estate · London SW1A 1AA", {
    x: 14,
    y: S19_LABEL_HEIGHT - 92,
    size: 8,
    font,
  });

  page.drawText("TO", {
    x: 14,
    y: S19_LABEL_HEIGHT - 118,
    size: 7,
    font: fontBold,
    color: muted,
  });
  page.drawText("Test Customer", {
    x: 14,
    y: S19_LABEL_HEIGHT - 132,
    size: 11,
    font: fontBold,
  });
  page.drawText("10 Alignment Street · Manchester M1 1AE", {
    x: 14,
    y: S19_LABEL_HEIGHT - 146,
    size: 9,
    font,
  });
  page.drawText("United Kingdom", {
    x: 14,
    y: S19_LABEL_HEIGHT - 160,
    size: 9,
    font,
  });

  let bx = 18;
  const barcodeY = 28;
  for (let i = 0; i < 48; i += 1) {
    const w = i % 5 === 0 ? 2.8 : i % 3 === 0 ? 1.8 : 1.1;
    page.drawRectangle({
      x: bx,
      y: barcodeY,
      width: w,
      height: 28,
      color: ink,
    });
    bx += w + 1.4;
  }

  page.drawText("TEST 0000 0000 0000", {
    x: (S19_LABEL_WIDTH - font.widthOfTextAtSize("TEST 0000 0000 0000", 8)) / 2,
    y: 14,
    size: 8,
    font,
    color: ink,
  });

  return doc.save();
}

/**
 * A4 pack sheet laid out for Royal Mail S19 integrated labels:
 * pick list above the perforation, shipping label in the bottom peel zone.
 */
export async function buildA4LabelPickSheetPdf(
  order: StoredOrder,
  labelPdfBytes: Uint8Array,
  options?: { testMode?: boolean; company?: PackSheetCompanyInfo | null },
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

  // Fit Shopify (or test) label into the exact S19 peel rectangle.
  const scale = Math.min(
    S19_LABEL_WIDTH / labelSize.width,
    S19_LABEL_HEIGHT / labelSize.height,
  );
  const drawWidth = labelSize.width * scale;
  const drawHeight = labelSize.height * scale;
  const labelX = S19_LABEL_LEFT + (S19_LABEL_WIDTH - drawWidth) / 2;
  const labelY = S19_LABEL_BOTTOM + (S19_LABEL_HEIGHT - drawHeight) / 2;

  page.drawPage(embeddedLabel, {
    x: labelX,
    y: labelY,
    width: drawWidth,
    height: drawHeight,
  });

  if (options?.testMode) {
    // Exact S19 adhesive outline for printer calibration.
    page.drawRectangle({
      x: S19_LABEL_LEFT,
      y: S19_LABEL_BOTTOM,
      width: S19_LABEL_WIDTH,
      height: S19_LABEL_HEIGHT,
      borderColor: rgb(0.85, 0.2, 0.2),
      borderWidth: 0.9,
      borderDashArray: [5, 3],
    });
  }

  // Perforation guide (S19: 123mm from bottom).
  page.drawLine({
    start: { x: 0, y: S19_PERFORATION_FROM_BOTTOM },
    end: { x: A4_WIDTH, y: S19_PERFORATION_FROM_BOTTOM },
    thickness: options?.testMode ? 0.9 : 0.4,
    color: options?.testMode ? rgb(0.85, 0.2, 0.2) : rgb(0.7, 0.7, 0.7),
    dashArray: options?.testMode ? [3, 3] : [2, 4],
  });

  // Pick list lives in the integrated area ABOVE the perforation.
  const pickBottom = S19_PERFORATION_FROM_BOTTOM + PICK_MARGIN_BOTTOM;
  const pickTop = A4_HEIGHT - PICK_MARGIN_TOP;
  let y = pickTop;

  const company = options?.company;
  const leftColX = PICK_MARGIN_X;
  const midGap = mm(8);
  const colWidth = (A4_WIDTH - PICK_MARGIN_X * 2 - midGap) / 2;
  const rightColX = PICK_MARGIN_X + colWidth + midGap;
  const maxAddrChars = 42;

  const fromLines: Array<{ text: string; bold?: boolean; size?: number }> = [];
  if (company?.name) {
    fromLines.push({ text: company.name, bold: true, size: 13 });
  }
  if (company?.website) {
    fromLines.push({
      text: company.website.replace(/^https?:\/\//i, ""),
      size: 10,
    });
  }
  for (const line of company?.addressLines ?? []) {
    fromLines.push({ text: line, size: 10 });
  }

  const shipLines = [
    order.buyerName,
    ...formatShippingAddressLines(order.shippingAddress),
    order.shippingAddress?.phone
      ? `Tel: ${order.shippingAddress.phone}`
      : null,
  ].filter((line): line is string => Boolean(line?.trim()));

  const toLines: Array<{ text: string; bold?: boolean; size?: number }> = [];
  shipLines.forEach((line, index) => {
    toLines.push({
      text: line,
      bold: index === 0,
      size: index === 0 ? 13 : 11,
    });
  });

  if (fromLines.length > 0 || toLines.length > 0) {
    const headerY = y;
    page.drawText("From", {
      x: leftColX,
      y: headerY,
      size: 10,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText("Ship to", {
      x: rightColX,
      y: headerY,
      size: 10,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    y = headerY - 14;

    const rowCount = Math.max(fromLines.length, toLines.length);
    for (let i = 0; i < rowCount; i += 1) {
      if (y < pickBottom + 70) {
        break;
      }
      const left = fromLines[i];
      const right = toLines[i];
      if (left) {
        page.drawText(left.text.slice(0, maxAddrChars), {
          x: leftColX,
          y,
          size: left.size ?? 10,
          font: left.bold ? fontBold : font,
          color: rgb(0.12, 0.12, 0.12),
        });
      }
      if (right) {
        page.drawText(right.text.slice(0, maxAddrChars), {
          x: rightColX,
          y,
          size: right.size ?? 11,
          font: right.bold ? fontBold : font,
          color: rgb(0.12, 0.12, 0.12),
        });
      }
      y -= 14;
    }

    y -= 4;
    page.drawLine({
      start: { x: PICK_MARGIN_X, y: y + 4 },
      end: { x: A4_WIDTH - PICK_MARGIN_X, y: y + 4 },
      thickness: 0.6,
      color: rgb(0.65, 0.65, 0.65),
    });
    y -= 10;
  }

  if (options?.testMode) {
    const testBanner =
      "TEST — Royal Mail S19 layout · print 100% (no fit-to-page) · label at bottom";
    page.drawText(testBanner, {
      x: (A4_WIDTH - fontBold.widthOfTextAtSize(testBanner, 9)) / 2,
      y,
      size: 9,
      font: fontBold,
      color: rgb(0.75, 0.15, 0.15),
    });
    y -= 16;
  }

  const channel = getSalesChannel(order.tags);

  page.drawText(options?.testMode ? "PICK LIST (TEST)" : "PICK LIST", {
    x: PICK_MARGIN_X,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(order.orderNumber, {
    x:
      A4_WIDTH -
      PICK_MARGIN_X -
      fontBold.widthOfTextAtSize(order.orderNumber, 18),
    y,
    size: 18,
    font: fontBold,
  });
  y -= 20;

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
    page.drawText(meta.slice(0, 95), {
      x: PICK_MARGIN_X,
      y,
      size: 11,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 16;
  }

  y -= 4;

  const colCheck = PICK_MARGIN_X;
  const colQty = PICK_MARGIN_X + 22;
  const colSku = PICK_MARGIN_X + 58;
  const colTitle = PICK_MARGIN_X + 200;
  const titleWidth = A4_WIDTH - PICK_MARGIN_X - colTitle;

  page.drawText("Qty", {
    x: colQty,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText("SKU", {
    x: colSku,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText("Item", {
    x: colTitle,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 5;
  page.drawLine({
    start: { x: PICK_MARGIN_X, y },
    end: { x: A4_WIDTH - PICK_MARGIN_X, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 16;

  for (const item of order.lineItems) {
    if (y < pickBottom + 22) {
      page.drawText("…more items on order — check Shopify", {
        x: PICK_MARGIN_X,
        y,
        size: 10,
        font,
        color: rgb(0.45, 0.45, 0.45),
      });
      break;
    }

    const sku =
      resolveLineItemSkuForDisplay(item.sku, item.title, item.temuSku) || "—";
    const qty = String(item.quantity);
    const titleLines = wrapText(
      item.title || "Item",
      font,
      12,
      titleWidth,
    ).slice(0, 2);
    const rowHeight = Math.max(18, titleLines.length * 14);

    drawCheckbox(page, colCheck, y, 12);
    page.drawText(qty, {
      x: colQty,
      y,
      size: 14,
      font: fontBold,
    });
    page.drawText(sku.slice(0, 24), {
      x: colSku,
      y,
      size: 12,
      font,
    });
    titleLines.forEach((line, index) => {
      page.drawText(line, {
        x: colTitle,
        y: y - index * 14,
        size: 12,
        font,
      });
    });

    y -= rowHeight + 8;
  }

  const footer = options?.testMode
    ? `S19 test · ${order.orderNumber} · label 160×105mm @ 25mm/8mm · perforation 123mm`
    : `${order.orderNumber} · ${order.lineItems.reduce((sum, i) => sum + i.quantity, 0)} unit(s) · S19 integrated`;
  page.drawText(footer, {
    x: PICK_MARGIN_X,
    y: pickBottom,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return out.save();
}

/** Test A4 pack sheet: S19-sized fake label + this order's pick list. */
export async function buildTestA4PackSheetPdf(
  order: StoredOrder,
  company?: PackSheetCompanyInfo | null,
): Promise<Uint8Array> {
  const labelBytes = await buildTestShippingLabelPdfBytes();
  return buildA4LabelPickSheetPdf(order, labelBytes, {
    testMode: true,
    company,
  });
}
