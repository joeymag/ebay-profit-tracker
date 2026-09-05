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
const MARGIN = 16;
/** Bottom stub height (cut line sits this far from the bottom edge). */
const CUT_FROM_BOTTOM = mm(75);
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.2, 0.2, 0.2);

const SCAN_INSTRUCTION =
  "Scan QR with your camera or download our app to take you to the product page";

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
  try {
    const filePath = path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      "public",
      "brand",
      "tstrade-logo.png",
    );
    const bytes = new Uint8Array(await fs.readFile(filePath));
    if (bytes.length >= 8) {
      return bytes;
    }
  } catch {
    // Fall through to the live logo URL.
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

/**
 * Logo image (if available) plus a solid black "tstrade.co.uk" wordmark so the
 * light grey ".co.uk" in the logo always prints clearly.
 */
async function drawBrandHeader(
  page: PDFPage,
  pdf: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
): Promise<number> {
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const maxLogoHeight = 56;
  let y = PAGE_HEIGHT - MARGIN;

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
    y -= height + 8;
  }

  const brand = "tstrade.co.uk";
  const brandSize = 16;
  const brandWidth = fonts.bold.widthOfTextAtSize(brand, brandSize);
  page.drawText(brand, {
    x: (PAGE_WIDTH - brandWidth) / 2,
    y: y - brandSize,
    size: brandSize,
    font: fonts.bold,
    color: INK,
  });

  return y - brandSize;
}

function drawCutLine(page: PDFPage, font: PDFFont) {
  const y = CUT_FROM_BOTTOM;
  const label = "CUT HERE";
  const labelSize = 9;
  const labelWidth = font.widthOfTextAtSize(label, labelSize);

  // Solid black guide (prints clearly on thermal + laser).
  page.drawLine({
    start: { x: MARGIN, y: y + 1.5 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 1.5 },
    thickness: 1.25,
    color: INK,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - 1.5 },
    end: { x: PAGE_WIDTH - MARGIN, y: y - 1.5 },
    thickness: 0.8,
    color: INK,
    dashArray: [3, 2.5],
  });

  // White strip behind the CUT label so it stays readable over the lines.
  page.drawRectangle({
    x: PAGE_WIDTH / 2 - labelWidth / 2 - 6,
    y: y - 5,
    width: labelWidth + 12,
    height: 12,
    color: rgb(1, 1, 1),
  });

  page.drawText(label, {
    x: (PAGE_WIDTH - labelWidth) / 2,
    y: y - 2.5,
    size: labelSize,
    font,
    color: INK,
  });

  // Tick marks at the edges.
  for (const x of [MARGIN, PAGE_WIDTH - MARGIN]) {
    page.drawLine({
      start: { x, y: y + 6 },
      end: { x, y: y - 6 },
      thickness: 1.5,
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
  const brandBottom = await drawBrandHeader(page, pdf, fonts);

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const nameTop = brandBottom - 22;
  const instructionReserve = 42;
  const nameBottomLimit = CUT_FROM_BOTTOM + instructionReserve + 16;
  const availableHeight = Math.max(36, nameTop - nameBottomLimit);

  let nameSize = 22;
  let nameLines = wrapText(input.productName, fonts.bold, nameSize, contentWidth);
  while (
    nameSize > 12 &&
    (nameLines.length * (nameSize + 5) > availableHeight ||
      nameLines.some(
        (line) => fonts.bold.widthOfTextAtSize(line, nameSize) > contentWidth,
      ))
  ) {
    nameSize -= 1;
    nameLines = wrapText(input.productName, fonts.bold, nameSize, contentWidth);
  }

  const blockHeight = nameLines.length * (nameSize + 5) - 5;
  const nameStartY = nameTop - (availableHeight - blockHeight) / 2 - nameSize;
  const nameEndY = drawCenteredLines(
    page,
    nameLines,
    fonts.bold,
    nameSize,
    nameStartY,
    nameSize + 5,
  );

  const instructionSize = 8.5;
  const instructionLines = wrapText(
    SCAN_INSTRUCTION,
    fonts.regular,
    instructionSize,
    contentWidth,
  );
  drawCenteredLines(
    page,
    instructionLines,
    fonts.regular,
    instructionSize,
    Math.min(nameEndY - 14, CUT_FROM_BOTTOM + instructionReserve),
    instructionSize + 3,
    MUTED,
  );

  drawCutLine(page, fonts.bold);

  // Bottom stub: centered product name + centered QR.
  const stubTop = CUT_FROM_BOTTOM - 18;
  const stubBottom = MARGIN;
  const stubHeight = stubTop - stubBottom;
  const qrSize = Math.min(110, stubHeight - 52);

  let stubNameSize = 14;
  let stubLines = wrapText(
    input.productName,
    fonts.bold,
    stubNameSize,
    contentWidth,
  );
  while (
    stubNameSize > 10 &&
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
  const stubNameStartY = stubTop - stubNameSize;
  drawCenteredLines(
    page,
    stubLines,
    fonts.bold,
    stubNameSize,
    stubNameStartY,
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
    stubTop - stubNameBlock - 12 - qrSize,
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
