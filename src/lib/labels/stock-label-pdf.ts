import bwipjs from "bwip-js";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_WIDTH = 4 * 72;
const PAGE_HEIGHT = 6 * 72;
const MARGIN = 22;
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.28, 0.28, 0.28);

export type StockLabelInput = {
  productName: string;
  /** Value encoded in the barcode (Shopify barcode, or SKU fallback). */
  barcodeValue: string;
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

async function renderBarcodePng(value: string): Promise<Uint8Array> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 4,
    height: 14,
    includetext: false,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
  return new Uint8Array(png);
}

async function drawLabelPage(
  pdf: PDFDocument,
  input: StockLabelInput,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  // Product name in the upper half.
  const nameTop = PAGE_HEIGHT - MARGIN - 8;
  const nameBottomLimit = PAGE_HEIGHT * 0.42;
  const availableHeight = Math.max(48, nameTop - nameBottomLimit);

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
  drawCenteredLines(
    page,
    nameLines,
    fonts.bold,
    nameSize,
    nameStartY,
    nameSize + 5,
  );

  // Barcode in the lower half.
  const barcodePng = await renderBarcodePng(input.barcodeValue);
  const barcodeImage = await pdf.embedPng(barcodePng);
  const maxBarcodeWidth = contentWidth;
  const maxBarcodeHeight = 110;
  const scale = Math.min(
    maxBarcodeWidth / barcodeImage.width,
    maxBarcodeHeight / barcodeImage.height,
  );
  const barcodeWidth = barcodeImage.width * scale;
  const barcodeHeight = barcodeImage.height * scale;
  const barcodeY = MARGIN + 52;

  page.drawImage(barcodeImage, {
    x: (PAGE_WIDTH - barcodeWidth) / 2,
    y: barcodeY,
    width: barcodeWidth,
    height: barcodeHeight,
  });

  const humanSize = 11;
  const human = input.barcodeValue;
  let display = human;
  if (fonts.regular.widthOfTextAtSize(display, humanSize) > contentWidth) {
    // Keep readable as much as possible on narrow labels.
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
    y: barcodeY - 22,
    size: humanSize,
    font: fonts.regular,
    color: MUTED,
  });
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

  for (let i = 0; i < copies; i += 1) {
    await drawLabelPage(
      pdf,
      { productName: name, barcodeValue },
      fonts,
    );
  }

  return pdf.save();
}
