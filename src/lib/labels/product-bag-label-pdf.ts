import fs from "fs/promises";
import path from "path";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

/** mm → PDF points (1pt = 1/72"). */
function mm(value: number): number {
  return (value * 72) / 25.4;
}

const PAGE_WIDTH = 4 * 72;
const PAGE_HEIGHT = 6 * 72;
const MARGIN = 18;
/** Bottom stub height (cut line sits this far from the bottom edge). */
const CUT_FROM_BOTTOM = mm(75);
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.28, 0.28, 0.28);

const SCAN_INSTRUCTION =
  "Scan the QR code with your camera, or open our app, to view this product";

export type ProductBagLabelInput = {
  productName: string;
  productUrl: string;
  copies?: number;
};

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
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

async function loadLogoBytes(): Promise<Uint8Array | null> {
  const candidates = [
    path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      "public",
      "brand",
      "tstrade-logo-print-black.png",
    ),
    path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      "public",
      "brand",
      "tstrade-logo.png",
    ),
  ];

  for (const filePath of candidates) {
    try {
      const bytes = new Uint8Array(await fs.readFile(filePath));
      if (bytes.length >= 8) {
        return bytes;
      }
    } catch {
      // Try the next candidate.
    }
  }

  try {
    const response = await fetch(
      "https://tstrade.co.uk/cdn/shop/t/3/assets/tstrade-logo.png",
      { cache: "force-cache" },
    );
    if (!response.ok) {
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function drawCenteredLines(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  fontSize: number,
  startY: number,
  lineHeight: number,
  color = INK,
) {
  let y = startY;
  for (const line of lines) {
    const width = font.widthOfTextAtSize(line, fontSize);
    page.drawText(line, {
      x: (PAGE_WIDTH - width) / 2,
      y,
      size: fontSize,
      font,
      color,
    });
    y -= lineHeight;
  }
  return y;
}

/** Solid black logo only — no duplicate URL text underneath. */
async function drawBrandHeader(
  page: PDFPage,
  pdf: PDFDocument,
): Promise<number> {
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const maxLogoHeight = 42;
  let y = PAGE_HEIGHT - MARGIN - 4;

  const logoBytes = await loadLogoBytes();
  if (logoBytes) {
    const image = await pdf.embedPng(logoBytes);
    const scale = Math.min(maxWidth / image.width, maxLogoHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: (PAGE_WIDTH - width) / 2,
      y: y - height,
      width,
      height,
    });
    y -= height + 14;

    // Subtle rule under the logo.
    const ruleWidth = Math.min(maxWidth * 0.55, width * 0.9);
    page.drawLine({
      start: { x: (PAGE_WIDTH - ruleWidth) / 2, y },
      end: { x: (PAGE_WIDTH + ruleWidth) / 2, y },
      thickness: 0.6,
      color: INK,
    });
    return y - 4;
  }

  // Fallback wordmark if the image is unavailable.
  const brand = "TS TRADE";
  const brandSize = 18;
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brandWidth = bold.widthOfTextAtSize(brand, brandSize);
  page.drawText(brand, {
    x: (PAGE_WIDTH - brandWidth) / 2,
    y: y - brandSize,
    size: brandSize,
    font: bold,
    color: INK,
  });
  return y - brandSize - 10;
}

function drawCutLine(page: PDFPage, font: PDFFont) {
  const y = CUT_FROM_BOTTOM;
  const label = "CUT HERE";
  const labelSize = 7.5;
  const labelWidth = font.widthOfTextAtSize(label, labelSize);
  const gap = 10;
  const leftEnd = PAGE_WIDTH / 2 - labelWidth / 2 - gap;
  const rightStart = PAGE_WIDTH / 2 + labelWidth / 2 + gap;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: leftEnd, y },
    thickness: 0.75,
    color: INK,
    dashArray: [2.5, 2],
  });
  page.drawLine({
    start: { x: rightStart, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.75,
    color: INK,
    dashArray: [2.5, 2],
  });

  page.drawText(label, {
    x: (PAGE_WIDTH - labelWidth) / 2,
    y: y - 2.5,
    size: labelSize,
    font,
    color: MUTED,
  });

  for (const x of [MARGIN, PAGE_WIDTH - MARGIN]) {
    page.drawLine({
      start: { x, y: y + 5 },
      end: { x, y: y - 5 },
      thickness: 1,
      color: INK,
    });
  }
}

async function drawLabelPage(
  pdf: PDFDocument,
  input: ProductBagLabelInput,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const brandBottom = await drawBrandHeader(page, pdf);

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const nameTop = brandBottom - 20;
  const instructionReserve = 38;
  const nameBottomLimit = CUT_FROM_BOTTOM + instructionReserve + 14;
  const availableHeight = Math.max(36, nameTop - nameBottomLimit);

  let nameSize = 20;
  let nameLines = wrapText(input.productName, fonts.bold, nameSize, contentWidth);
  while (
    nameSize > 11 &&
    (nameLines.length * (nameSize + 4) > availableHeight ||
      nameLines.some(
        (line) => fonts.bold.widthOfTextAtSize(line, nameSize) > contentWidth,
      ))
  ) {
    nameSize -= 1;
    nameLines = wrapText(input.productName, fonts.bold, nameSize, contentWidth);
  }

  const blockHeight = nameLines.length * (nameSize + 4) - 4;
  const nameStartY = nameTop - (availableHeight - blockHeight) / 2 - nameSize;
  const nameEndY = drawCenteredLines(
    page,
    nameLines,
    fonts.bold,
    nameSize,
    nameStartY,
    nameSize + 4,
  );

  const instructionSize = 8;
  const instructionLines = wrapText(
    SCAN_INSTRUCTION,
    fonts.regular,
    instructionSize,
    contentWidth - 8,
  );
  drawCenteredLines(
    page,
    instructionLines,
    fonts.regular,
    instructionSize,
    Math.min(nameEndY - 16, CUT_FROM_BOTTOM + instructionReserve),
    instructionSize + 2.5,
    MUTED,
  );

  drawCutLine(page, fonts.regular);

  // Bottom stub: centered product name + centered QR.
  const stubTop = CUT_FROM_BOTTOM - 16;
  const stubBottom = MARGIN;
  const stubHeight = stubTop - stubBottom;
  const qrSize = Math.min(108, stubHeight - 48);

  let stubNameSize = 13;
  let stubLines = wrapText(
    input.productName,
    fonts.bold,
    stubNameSize,
    contentWidth,
  );
  while (
    stubNameSize > 9.5 &&
    (stubLines.length > 3 ||
      stubLines.some(
        (line) => fonts.bold.widthOfTextAtSize(line, stubNameSize) > contentWidth,
      ))
  ) {
    stubNameSize -= 0.5;
    stubLines = wrapText(
      input.productName,
      fonts.bold,
      stubNameSize,
      contentWidth,
    ).slice(0, 3);
  }
  stubLines = stubLines.slice(0, 3);

  const stubNameBlock = stubLines.length * (stubNameSize + 3) - 3;
  drawCenteredLines(
    page,
    stubLines,
    fonts.bold,
    stubNameSize,
    stubTop - stubNameSize,
    stubNameSize + 3,
  );

  const qrPng = await QRCode.toBuffer(input.productUrl, {
    type: "png",
    margin: 1,
    errorCorrectionLevel: "M",
    width: 400,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrImage = await pdf.embedPng(qrPng);
  const qrY = Math.max(
    stubBottom + 4,
    stubTop - stubNameBlock - 10 - qrSize,
  );
  page.drawImage(qrImage, {
    x: (PAGE_WIDTH - qrSize) / 2,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });
}

export async function buildProductBagLabelPdf(
  input: ProductBagLabelInput,
): Promise<Uint8Array> {
  const name = input.productName.trim();
  if (!name) {
    throw new Error("Product name is required.");
  }
  if (!input.productUrl.trim()) {
    throw new Error("Product page URL is required.");
  }

  const copies = Math.min(50, Math.max(1, Math.round(input.copies ?? 1)));
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  for (let i = 0; i < copies; i += 1) {
    await drawLabelPage(pdf, { ...input, productName: name }, fonts);
  }

  return pdf.save();
}
