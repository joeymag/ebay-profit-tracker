import { inflateRawSync } from "node:zlib";

import type { AccountPayment } from "@/lib/accounting/payments";
import { TemuApiError, temuCall, temuCallValues } from "@/lib/temu/client";
import type { TemuCredentials } from "@/lib/temu/config";
import { signTemuRequest } from "@/lib/temu/sign";
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

function fileShape(fileUrl: string): string {
  try {
    const url = new URL(fileUrl);
    const keys = [...url.searchParams.keys()];
    return `${url.host}${url.pathname} params ${keys.join(", ") || "none"}`;
  } catch {
    return "unreadable file url";
  }
}

function responseDetail(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.slice(0, 400) || "empty response";
}

function fileAuthHeaders(credentials: TemuCredentials): Record<string, string> {
  const fields: Record<string, string> = {
    app_key: credentials.appKey,
    access_token: credentials.accessToken,
    data_type: "JSON",
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  return { ...fields, sign: signTemuRequest(fields, credentials.appSecret) };
}

async function downloadReport(
  fileUrl: string,
  fileName: string,
  credentials: TemuCredentials,
): Promise<AccountPayment[]> {
  const proxy = process.env.TEMU_PROXY_URL?.trim() || "https://145.241.234.131.sslip.io";
  const token = process.env.TEMU_PROXY_SECRET?.trim() ?? "";
  const response = await fetch(`${proxy}/temu-file`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ url: fileUrl, headerSets: [fileAuthHeaders(credentials)] }),
  });
  if (!response.ok) {
    const detail = responseDetail(await response.text());
    const shape = fileShape(fileUrl);
    console.error("Temu payment report download failed", {
      status: response.status,
      shape,
      fileName,
      contentType: response.headers.get("content-type"),
      body: detail,
    });
    throw new Error(
      `Temu payment report download failed (${response.status}) from ${shape}. ${detail}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return paymentsFromRows(readRows(buffer, fileName));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcMidnight(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Closed UTC days, with the current day ending a minute ago so the end is not in the future. */
function reportRanges(totalDays: number, chunkDays: number): Array<{ start: number; end: number }> {
  const now = Date.now() - 60_000;
  const todayStart = utcMidnight(now);
  const windowStart = todayStart - (totalDays - 1) * DAY_MS;
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = windowStart; start <= todayStart; start += chunkDays * DAY_MS) {
    const chunkLastDay = Math.min(start + (chunkDays - 1) * DAY_MS, todayStart);
    const end = chunkLastDay === todayStart ? now : chunkLastDay + DAY_MS - 1;
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}

function eachUtcDay(start: number, end: number): Array<{ start: number; end: number }> {
  const now = Date.now() - 60_000;
  const days: Array<{ start: number; end: number }> = [];
  for (let day = utcMidnight(start); day <= utcMidnight(end); day += DAY_MS) {
    const dayEnd = Math.min(day + DAY_MS - 1, now);
    if (dayEnd > day) days.push({ start: day, end: dayEnd });
  }
  return days;
}

type BillCallStyle = "values" | "nested";

async function createBillTask(
  credentials: TemuCredentials,
  startMs: number,
  endMs: number,
): Promise<{ task: BillTask; style: BillCallStyle }> {
  const attempts: Array<{ style: BillCallStyle; run: () => Promise<BillTask> }> = [
    {
      style: "values",
      run: () =>
        temuCallValues<BillTask>(credentials, "temu.finance.mall.bill.task.create", {
          fileType: "PAYMENT_REPORT",
          startTime: startMs,
          endTime: endMs,
        }),
    },
    {
      style: "nested",
      run: () =>
        temuCall<BillTask>(credentials, "temu.finance.mall.bill.task.create", {
          fileType: "PAYMENT_REPORT",
          startTime: startMs,
          endTime: endMs,
        }),
    },
    {
      style: "values",
      run: () =>
        temuCallValues<BillTask>(credentials, "temu.finance.mall.bill.task.create", {
          fileType: "PAYMENT_REPORT",
          startTime: Math.floor(startMs / 1000),
          endTime: Math.floor(endMs / 1000),
        }),
    },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return { task: await attempt.run(), style: attempt.style };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (!/invalid parameter/i.test(message)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new TemuApiError("Temu rejected the request.");
}

async function readBillTask(
  credentials: TemuCredentials,
  taskId: string,
  style: BillCallStyle,
): Promise<BillTask> {
  if (style === "values") {
    return temuCallValues<BillTask>(credentials, "temu.finance.mall.bill.task.get", { taskId });
  }
  return temuCall<BillTask>(credentials, "temu.finance.mall.bill.task.get", { taskId });
}

async function startReport(
  credentials: TemuCredentials,
  start: number,
  end: number,
): Promise<{ taskId: string; style: BillCallStyle } | null> {
  const created = await createBillTask(credentials, start, end);
  const taskId = created.task.taskId?.trim();
  return taskId ? { taskId, style: created.style } : null;
}

async function startPaymentReports(
  credentials: TemuCredentials,
  days: number,
): Promise<Array<{ taskId: string; style: BillCallStyle }>> {
  const started: Array<{ taskId: string; style: BillCallStyle }> = [];
  const rejected: Array<{ start: number; end: number }> = [];

  for (const range of reportRanges(days, 7)) {
    try {
      const task = await startReport(credentials, range.start, range.end);
      if (task) started.push(task);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/invalid date range/i.test(message)) throw error;
      rejected.push(range);
    }
  }

  const dayWindows =
    started.length === 0 && rejected.length > 0
      ? eachUtcDay(rejected[rejected.length - 1].start, rejected[rejected.length - 1].end)
      : rejected.flatMap((range) => eachUtcDay(range.start, range.end));

  for (const range of dayWindows) {
    try {
      const task = await startReport(credentials, range.start, range.end);
      if (task) started.push(task);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/invalid date range/i.test(message)) throw error;
    }
  }

  return started;
}

export async function listTemuAccountPayments(days = 30): Promise<{
  payments: AccountPayment[];
  warning: string | null;
}> {
  const credentials = await getStoredTemuCredentials();
  if (!credentials) return { payments: [], warning: null };

  const pending = await startPaymentReports(credentials, days);
  if (pending.length === 0) {
    return { payments: [], warning: "Invalid date range" };
  }

  const payments: AccountPayment[] = [];
  let warning: string | null = null;

  for (let attempt = 0; attempt < 12 && pending.length > 0; attempt += 1) {
    if (attempt > 0) await wait(2000);
    const stillPending: Array<{ taskId: string; style: BillCallStyle }> = [];
    for (const job of pending) {
      const task = await readBillTask(credentials, job.taskId, job.style);
      if (task.fileUrl?.trim()) {
        const rows = await downloadReport(
          task.fileUrl.trim(),
          task.fileName?.trim() || "",
          credentials,
        );
        payments.push(
          ...rows.map((row, index) => ({ ...row, id: `${job.taskId}-${index}` })),
        );
        continue;
      }
      const status = task.status?.trim() ?? "";
      if (/fail|error|cancel/i.test(status) || task.errorMessage?.trim()) {
        warning = task.errorMessage?.trim() || `Temu payment report ${status || "failed"}.`;
        continue;
      }
      stillPending.push(job);
    }
    pending.splice(0, pending.length, ...stillPending);
  }

  payments.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  if (pending.length > 0) {
    warning = "Temu is still preparing the payment report. Refresh in a moment.";
  }
  return {
    payments,
    warning:
      payments.length === 0
        ? warning || "The Temu report downloaded, but it had no payment rows."
        : warning,
  };
}
