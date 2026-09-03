import fs from "fs/promises";
import path from "path";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

const PAGE_WIDTH = 4 * 72;
const PAGE_HEIGHT = 6 * 72;
const MARGIN = 18;
const CUT_FROM_BOTTOM = 2 * 72;
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.35, 0.35, 0.35);

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

function fitFontSize(
  text: string,
  font: PDFFont,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): number {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

async function loadLogoBytes(): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  try {
    const filePath = path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      "public",
      "brand",
      "tstrade-logo.png",
    );
    const bytes = new Uint8Array(await fs.readFile(filePath));
    if (bytes.length >= 8) {
      return { bytes, kind: "png" };
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
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      kind: "png",
    };
  } catch {
    return null;
  }
}

async function drawLogo(page: PDFPage, pdf: PDFDocument): Promise<number> {
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const maxHeight = 72;
  const top = PAGE_HEIGHT - MARGIN;

  const logo = await loadLogoBytes();
  if (logo) {
    const image =
      logo.kind === "png"
        ? await pdf.embedPng(logo.bytes)
        : await pdf.embedJpg(logo.bytes);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: (PAGE_WIDTH - width) / 2,
      y: top - height,
      width,
      height,
    });
    return top - height;
  }

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const label = "tstrade";
  const size = 28;
  const width = font.widthOfTextAtSize(label, size);
  page.drawText(label, {
    x: (PAGE_WIDTH - width) / 2,
    y: top - size,
    size,
    font,
    color: INK,
  });
  return top - size;
}

function drawCenteredLines(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  fontSize: number,
  startY: number,
  lineHeight: number,
) {
  let y = startY;
  for (const line of lines) {
    const width = font.widthOfTextAtSize(line, fontSize);
    page.drawText(line, {
      x: (PAGE_WIDTH - width) / 2,
      y,
      size: fontSize,
      font,
      color: INK,
    });
    y -= lineHeight;
  }
}

function drawCutLine(page: PDFPage, font: PDFFont) {
  const y = CUT_FROM_BOTTOM;
  const label = "CUT";
  const labelSize = 7;
  const labelWidth = font.widthOfTextAtSize(label, labelSize);
  const gap = 10;
  const leftEnd = PAGE_WIDTH / 2 - labelWidth / 2 - gap;
  const rightStart = PAGE_WIDTH / 2 + labelWidth / 2 + gap;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: leftEnd, y },
    thickness: 0.7,
    color: MUTED,
    dashArray: [4, 3],
  });
  page.drawText(label, {
    x: (PAGE_WIDTH - labelWidth) / 2,
    y: y - 2.5,
    size: labelSize,
    font,
    color: MUTED,
  });
  page.drawLine({
    start: { x: rightStart, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.7,
    color: MUTED,
    dashArray: [4, 3],
  });
}

async function drawLabelPage(
  pdf: PDFDocument,
  input: ProductBagLabelInput,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const logoBottom = await drawLogo(page, pdf);

  const nameMaxWidth = PAGE_WIDTH - MARGIN * 2;
  const nameTop = logoBottom - 28;
  const nameBottomLimit = CUT_FROM_BOTTOM + 24;
  const availableHeight = Math.max(40, nameTop - nameBottomLimit);

  let nameSize = 22;
  let nameLines = wrapText(input.productName, fonts.bold, nameSize, nameMaxWidth);
  while (
    nameSize > 12 &&
    (nameLines.length * (nameSize + 6) > availableHeight ||
      nameLines.some(
        (line) => fonts.bold.widthOfTextAtSize(line, nameSize) > nameMaxWidth,
      ))
  ) {
    nameSize -= 1;
    nameLines = wrapText(input.productName, fonts.bold, nameSize, nameMaxWidth);
  }

  const blockHeight = nameLines.length * (nameSize + 6) - 6;
  const nameStartY = nameTop - (availableHeight - blockHeight) / 2 - nameSize;
  drawCenteredLines(
    page,
    nameLines,
    fonts.bold,
    nameSize,
    nameStartY,
    nameSize + 6,
  );

  drawCutLine(page, fonts.regular);

  const stubTop = CUT_FROM_BOTTOM - 14;
  const qrSize = 96;
  const qrX = PAGE_WIDTH - MARGIN - qrSize;
  const qrY = MARGIN + 10;

  const qrPng = await QRCode.toBuffer(input.productUrl, {
    type: "png",
    margin: 0,
    errorCorrectionLevel: "M",
    width: 360,
    color: { dark: "#141414", light: "#ffffff" },
  });
  const qrImage = await pdf.embedPng(qrPng);
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  const stubTextWidth = qrX - MARGIN - 12;
  const stubNameSize = fitFontSize(
    input.productName,
    fonts.bold,
    stubTextWidth,
    11,
    7,
  );
  const stubLines = wrapText(
    input.productName,
    fonts.bold,
    stubNameSize,
    stubTextWidth,
  ).slice(0, 5);

  let stubY = stubTop - stubNameSize;
  for (const line of stubLines) {
    page.drawText(line, {
      x: MARGIN,
      y: stubY,
      size: stubNameSize,
      font: fonts.bold,
      color: INK,
    });
    stubY -= stubNameSize + 3;
  }

  const scanHint = "Scan for product page";
  page.drawText(scanHint, {
    x: qrX,
    y: qrY - 11,
    size: 7,
    font: fonts.regular,
    color: MUTED,
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
