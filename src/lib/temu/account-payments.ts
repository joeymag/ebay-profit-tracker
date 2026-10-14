import { inflateRawSync } from "node:zlib";

import type { AccountPayment } from "@/lib/accounting/payments";
import { temuCall } from "@/lib/temu/client";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

type BillTask = {
  taskId?: string;
  status?: string;
  fileUrl?: string;
  fileName?: string;
  errorMessage?: string;
  errorCode?: string;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unzip(buffer: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let offset = 0;
  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    files.set(name, data.toString("utf8"));
    offset = start + compressedSize;
  }
  return files;
}

function xmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function columnIndex(cellRef: string): number {
  const letters = cellRef.replace(/[0-9]/g, "");
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function readXlsxRows(buffer: Buffer): string[][] {
  const files = unzip(buffer);
  const shared = files.get("xl/sharedStrings.xml") ?? "";
  const strings = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    xmlText(match[1] ?? ""),
  );
  const sheet =
    files.get("xl/worksheets/sheet1.xml") ??
    [...files.entries()].find(([name]) => name.startsWith("xl/worksheets/sheet"))?.[1] ??
    "";
  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? "").matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = cell[1]?.match(/\br="([A-Z]+)\d+"/)?.[1] ?? "";
      const type = cell[1]?.match(/\bt="([^"]+)"/)?.[1] ?? "";
      const value = cell[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const index = columnIndex(ref);
      const text =
        type === "s" ? (strings[Number(value)] ?? "") : type === "inlineStr" ? xmlText(cell[2] ?? "") : value;
      cells[index] = text;
    }
    rows.push(cells.map((cell) => cell ?? ""));
  }
  return rows;
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function readCsvRows(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(splitCsv);
}

function readRows(buffer: Buffer, fileName: string): string[][] {
  const name = fileName.toLowerCase();
  if (name.endsWith(".xlsx") || (buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    return readXlsxRows(buffer);
  }
  return readCsvRows(buffer.toString("utf8"));
}

function headerIndex(headers: string[], labels: string[]): number {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const label of labels) {
    const exact = normalized.indexOf(label);
    if (exact >= 0) return exact;
  }
  return normalized.findIndex((header) => labels.some((label) => header.includes(label)));
}

function parseMoney(value: string | undefined): number | null {
  if (!value?.trim() || value.trim() === "-" || value.trim() === "—") return null;
  const negative = /^\(.*\)$/.test(value.trim()) || value.includes("-");
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount)) return null;
  return negative ? -amount : amount;
}

function parseDate(value: string): string {
  const serial = Number(value);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000 && !value.includes("/")) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString();
  }
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  const month = second > 12 ? first : first > 12 ? second : first;
  const day = second > 12 ? second : first > 12 ? first : second;
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function paymentsFromRows(rows: string[][]): AccountPayment[] {
  const headerRow = rows.findIndex((row) => {
    const joined = row.join(" ").toLowerCase();
    return joined.includes("transaction") && joined.includes("order");
  });
  if (headerRow < 0) return [];
  const headers = rows[headerRow] ?? [];
  const dateIndex = headerIndex(headers, ["date"]);
  const typeIndex = headerIndex(headers, ["transaction type"]);
  const orderIndex = headerIndex(headers, ["order id", "order number"]);
  const batchIndex = headerIndex(headers, ["batch id"]);
  const productIndex = headerIndex(headers, ["total product charges", "product charges"]);
  const othersIndex = headerIndex(headers, ["others"]);
  const totalIndex = headerIndex(headers, ["total amount", "total"]);

  return rows.slice(headerRow + 1).flatMap((row, index) => {
    const type = row[typeIndex]?.trim();
    const reference = row[orderIndex]?.trim();
    if (!type && !reference) return [];
    const amount = parseMoney(row[totalIndex]);
    return [
      {
        id: `${reference || "row"}-${index}`,
        date: parseDate(row[dateIndex] ?? ""),
        type: type || "Payment",
        status: "Posted",
        reference: reference && reference !== "-" ? reference : null,
        description: type || "Payment",
        amount,
        currency: "GBP",
        batchId: row[batchIndex]?.trim() && row[batchIndex]?.trim() !== "-" ? row[batchIndex].trim() : null,
        productCharges: parseMoney(row[productIndex]),
        otherAmount: parseMoney(row[othersIndex]),
      },
    ];
  });
}

async function downloadReport(fileUrl: string, fileName: string): Promise<AccountPayment[]> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Temu payment report download failed (${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return paymentsFromRows(readRows(buffer, fileName));
}

export async function listTemuAccountPayments(days = 30): Promise<{
  payments: AccountPayment[];
  warning: string | null;
}> {
  const credentials = await getStoredTemuCredentials();
  if (!credentials) return { payments: [], warning: null };

  const end = Date.now();
  const start = end - days * 24 * 60 * 60 * 1000;
  const created = await temuCall<BillTask>(credentials, "temu.finance.mall.bill.task.create", {
    fileType: "PAYMENT_REPORT",
    startTime: start,
    endTime: end,
  });
  const taskId = created.taskId?.trim();
  if (!taskId) {
    return { payments: [], warning: "Temu did not start a payment report." };
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) await wait(2000);
    const task = await temuCall<BillTask>(credentials, "temu.finance.mall.bill.task.get", {
      taskId,
    });
    if (task.fileUrl?.trim()) {
      const payments = await downloadReport(task.fileUrl.trim(), task.fileName?.trim() || "");
      payments.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
      return {
        payments,
        warning: payments.length === 0 ? "The Temu report downloaded, but it had no payment rows." : null,
      };
    }
    const status = task.status?.trim() ?? "";
    if (/fail|error|cancel/i.test(status) || task.errorMessage?.trim()) {
      return {
        payments: [],
        warning: task.errorMessage?.trim() || `Temu payment report ${status || "failed"}.`,
      };
    }
  }

  return {
    payments: [],
    warning: "Temu is still preparing the payment report. Refresh in a moment.",
  };
}
