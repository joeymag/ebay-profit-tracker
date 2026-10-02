import bwipjs from "bwip-js";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/** Physical 4" × 6" thermal label — two stock stickers per sheet. */
const PAGE_WIDTH = 4 * 72;
const PAGE_HEIGHT = 6 * 72;
const HALF_HEIGHT = PAGE_HEIGHT / 2;
const MARGIN = 14;
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.28, 0.28, 0.28);

export type StockLabelInput = {
  productName: string;
  /** Value encoded in the barcode (Shopify barcode, or SKU fallback). */
  barcodeValue: string;
  /** Number of 4×6 sheets (each sheet has 2 stock labels). */
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

async function renderBarcodePng(value: string): Promise<Uint8Array> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 4,
    height: 12,
    includetext: false,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
  return new Uint8Array(png);
}

function drawCutLine(page: PDFPage, font: PDFFont) {
  const y = HALF_HEIGHT;
  const label = "CUT HERE";
  const labelSize = 7;
  const labelWidth = font.widthOfTextAtSize(label, labelSize);
  const gap = 8;
  const leftEnd = PAGE_WIDTH / 2 - labelWidth / 2 - gap;
  const rightStart = PAGE_WIDTH / 2 + labelWidth / 2 + gap;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: leftEnd, y },
    thickness: 0.7,
    color: INK,
    dashArray: [2.5, 2],
  });
  page.drawLine({
    start: { x: rightStart, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.7,
    color: INK,
    dashArray: [2.5, 2],
  });

  page.drawText(label, {
    x: (PAGE_WIDTH - labelWidth) / 2,
    y: y - 2.2,
    size: labelSize,
    font,
    color: MUTED,
  });
}

/**
 * Draw one stock sticker into a half-page band.
 * `bandBottom` is the PDF y of the bottom of that half (0 or HALF_HEIGHT).
 */
function drawHalfLabel(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  productName: string,
  barcodeValue: string,
  barcodeImage: PDFImage,
  bandBottom: number,
) {
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const bandTop = bandBottom + HALF_HEIGHT;
  const innerTop = bandTop - MARGIN;
  const innerBottom = bandBottom + MARGIN;
  const innerHeight = innerTop - innerBottom;

  // Name in the upper ~45% of the half; barcode in the lower ~55%.
  const nameRegionHeight = innerHeight * 0.42;
  const nameTop = innerTop - 2;

  let nameSize = 14;
  let nameLines = wrapText(productName, fonts.bold, nameSize, contentWidth);
  while (
    nameSize > 9 &&
    (nameLines.length * (nameSize + 3) > nameRegionHeight ||
      nameLines.some(
        (line) => fonts.bold.widthOfTextAtSize(line, nameSize) > contentWidth,
      ))
  ) {
    nameSize -= 0.5;
    nameLines = wrapText(productName, fonts.bold, nameSize, contentWidth);
  }
  nameLines = nameLines.slice(
    0,
    Math.max(1, Math.floor(nameRegionHeight / (nameSize + 3))),
  );

  const lineHeight = nameSize + 3;
  const textBlockHeight = nameLines.length * lineHeight - 3;
  let textY =
    nameTop - (nameRegionHeight - textBlockHeight) / 2 - nameSize + 2;
  for (const line of nameLines) {
    const width = fonts.bold.widthOfTextAtSize(line, nameSize);
    page.drawText(line, {
      x: (PAGE_WIDTH - width) / 2,
      y: textY,
      size: nameSize,
      font: fonts.bold,
      color: INK,
    });
    textY -= lineHeight;
  }

  const humanSize = 9;
  const humanReserve = 16;
  const barcodeRegionTop = innerTop - nameRegionHeight - 4;
  const barcodeRegionBottom = innerBottom + humanReserve;
  const maxBarcodeWidth = contentWidth;
  const maxBarcodeHeight = Math.max(36, barcodeRegionTop - barcodeRegionBottom);

  const scale = Math.min(
    maxBarcodeWidth / barcodeImage.width,
    maxBarcodeHeight / barcodeImage.height,
  );
  const barcodeWidth = barcodeImage.width * scale;
  const barcodeHeight = barcodeImage.height * scale;
  const barcodeY =
    barcodeRegionBottom + (maxBarcodeHeight - barcodeHeight) / 2;

  page.drawImage(barcodeImage, {
    x: (PAGE_WIDTH - barcodeWidth) / 2,
    y: barcodeY,
    width: barcodeWidth,
    height: barcodeHeight,
  });

  let display = barcodeValue;
  if (fonts.regular.widthOfTextAtSize(display, humanSize) > contentWidth) {
    while (
      display.length > 8 &&
      fonts.regular.widthOfTextAtSize(display, humanSize) > contentWidth
    ) {
      display = `${display.slice(0, -1)}…`;
    }
  }
  const humanWidth = fonts.regular.widthOfTextAtSize(display, humanSize);
  page.drawText(display, {
    x: (PAGE_WIDTH - humanWidth) / 2,
    y: innerBottom + 2,
    size: humanSize,
    font: fonts.regular,
    color: MUTED,
  });
}

async function drawLabelPage(
  pdf: PDFDocument,
  input: StockLabelInput,
  fonts: { regular: PDFFont; bold: PDFFont },
  barcodeImage: PDFImage,
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Top half then bottom half (same product twice).
  drawHalfLabel(
    page,
    fonts,
    input.productName,
    input.barcodeValue,
    barcodeImage,
    HALF_HEIGHT,
  );
  drawHalfLabel(
    page,
    fonts,
    input.productName,
    input.barcodeValue,
    barcodeImage,
    0,
  );
  drawCutLine(page, fonts.regular);
}

export async function buildStockLabelPdf(
  input: StockLabelInput,
): Promise<Uint8Array> {
  const name = input.productName.trim();
  const barcodeValue = input.barcodeValue.trim();
  if (!name) {
    throw new Error("Product name is required.");
  }
  if (!barcodeValue) {
    throw new Error("Barcode value is required.");
  }

  const copies = Math.min(50, Math.max(1, Math.round(input.copies ?? 1)));
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const barcodePng = await renderBarcodePng(barcodeValue);
  const barcodeImage = await pdf.embedPng(barcodePng);

  for (let i = 0; i < copies; i += 1) {
    await drawLabelPage(
      pdf,
      { productName: name, barcodeValue },
      fonts,
      barcodeImage,
    );
  }

  return pdf.save();
}
