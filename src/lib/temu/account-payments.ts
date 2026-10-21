import { gunzipSync, inflateRawSync } from "node:zlib";

import type { AccountPayment } from "@/lib/accounting/payments";
import { TemuApiError, getTemuAccessTokenInfo, temuCall, temuCallValues } from "@/lib/temu/client";
import type { TemuCredentials } from "@/lib/temu/config";
import { signTemuRequest } from "@/lib/temu/sign";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

const DOWNLOAD_BLOCKED_HINT =
  "Temu created the report but their OpenAPI host blocks the CSV download (403). In Seller Center open Finances → Payments, download the payment report CSV/Excel, then upload it here.";

type BillTask = {
  taskId?: string;
  status?: string;
  fileUrl?: string;
  fileName?: string;
  errorMessage?: string;
  expiresAt?: number;
  errorCode?: string;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 22 - 65536); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd >= 0) {
    let offset = buffer.readUInt32LE(eocd + 16);
    const count = buffer.readUInt16LE(eocd + 10);
    for (let entry = 0; entry < count && offset + 46 <= buffer.length; entry += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
      const method = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localOffset = buffer.readUInt32LE(offset + 42);
      const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
      if (localOffset + 30 <= buffer.length) {
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = buffer.subarray(start, start + compressedSize);
        files.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
    if (files.size > 0) return files;
  }
  let offset = 0;
  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    files.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
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

function readXlsxRows(files: Map<string, Buffer>): string[][] {
  const shared = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const strings = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    xmlText(match[1] ?? ""),
  );
  const sheet =
    files.get("xl/worksheets/sheet1.xml")?.toString("utf8") ??
    [...files.entries()].find(([name]) => name.startsWith("xl/worksheets/sheet"))?.[1]?.toString("utf8") ??
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

function decodeText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1] ?? 0;
      swapped[index - 1] = buffer[index] ?? 0;
    }
    return swapped.toString("utf16le");
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 200));
  let zeros = 0;
  for (const byte of sample) if (byte === 0) zeros += 1;
  if (sample.length > 0 && zeros > sample.length / 4) return buffer.toString("utf16le");
  return buffer.toString("utf8");
}

function splitCsv(line: string, delimiter: string): string[] {
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
    if (char === delimiter && !quoted) {
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
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const first = lines[0] ?? "";
  const commas = first.split(",").length;
  const semicolons = first.split(";").length;
  const tabs = first.split("\t").length;
  const delimiter = tabs >= commas && tabs >= semicolons && tabs > 1 ? "\t" : semicolons > commas ? ";" : ",";
  return lines.map((line) => splitCsv(line, delimiter));
}

function readRows(buffer: Buffer, fileName: string): { rows: string[][]; entries: string[] } {
  let body = buffer;
  if (body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body);
  const zipped = fileName.toLowerCase().endsWith(".xlsx") || (body[0] === 0x50 && body[1] === 0x4b);
  if (!zipped) return { rows: readCsvRows(decodeText(body)), entries: [] };
  const files = unzip(body);
  const entries = [...files.keys()];
  const sheetRows = readXlsxRows(files);
  if (sheetRows.length > 0) return { rows: sheetRows, entries };
  const csvRows = [...files.entries()]
    .filter(([name]) => /\.(csv|txt)$/i.test(name))
    .flatMap(([, data]) => readCsvRows(decodeText(data)));
  return { rows: csvRows, entries };
}

function headerIndex(headers: string[], labels: string[], skip = -1): number {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const label of labels) {
    const exact = normalized.findIndex((header, index) => index !== skip && header === label);
    if (exact >= 0) return exact;
  }
  return normalized.findIndex(
    (header, index) => index !== skip && labels.some((label) => header.includes(label)),
  );
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

function isHeader(row: string[]): boolean {
  const joined = row.join(" ").toLowerCase();
  const hasType = /transaction|transaktion|type|交易/.test(joined);
  const hasOrder = /order|bestell|订单|batch/.test(joined);
  const hasMoney = /total|amount|charge|fee|收入|金额/.test(joined);
  const hasDate = /date|time|datum|账务时间/.test(joined);
  return (hasType && hasOrder) || (hasDate && hasMoney && row.length >= 4);
}

function paymentsFromRows(rows: string[][]): AccountPayment[] {
  let headerRow = rows.findIndex(isHeader);
  if (headerRow < 0 && (rows[0]?.length ?? 0) >= 4) headerRow = 0;
  if (headerRow < 0) return [];
  const headers = rows[headerRow] ?? [];
  const dateIndex = headerIndex(headers, ["date/time", "date", "账务时间", "datum"]);
  const typeIndex = headerIndex(headers, ["transaction type", "transaktionsart", "交易类型", "type"]);
  const orderIndex = headerIndex(headers, ["order id", "related order id", "order number", "订单编号", "order"]);
  const batchIndex = headerIndex(headers, ["batch id", "batch"]);
  const productIndex = headerIndex(headers, ["total product charges", "product charges", "retail price", "交易收入"]);
  const othersIndex = headerIndex(headers, ["others", "service fee"]);
  const totalIndex = headerIndex(headers, ["total amount", "总金额", "total"], productIndex);
  const currencyIndex = headerIndex(headers, ["currency", "币种"]);

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
        currency: row[currencyIndex]?.trim() || "GBP",
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
  return text.slice(0, 4000) || "empty response";
}

function linkExpiry(expiresAt?: number): string {
  if (!expiresAt) return "expiry not sent";
  const ms = expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt;
  const seconds = Math.round((ms - Date.now()) / 1000);
  const when = new Date(ms).toISOString();
  return seconds >= 0 ? `expires ${when} (in ${seconds}s)` : `expired ${when} (${-seconds}s ago)`;
}

function fileAuthHeaders(credentials: TemuCredentials, fileUrl: string): Record<string, string> {
  let signOM = "";
  try {
    signOM = new URL(fileUrl).searchParams.get("signOM") ?? "";
  } catch {
    signOM = "";
  }
  const fields: Record<string, string> = {
    app_key: credentials.appKey,
    access_token: credentials.accessToken,
    data_type: "JSON",
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...(signOM ? { signOM } : {}),
    ...(credentials.mallId ? { mallid: credentials.mallId } : {}),
  };
  return { ...fields, sign: signTemuRequest(fields, credentials.appSecret) };
}

export function parseTemuPaymentReport(
  buffer: Buffer,
  fileName: string,
): { payments: AccountPayment[]; note: string | null } {
  const parsed = readRows(buffer, fileName);
  const payments = paymentsFromRows(parsed.rows);
  if (payments.length > 0) return { payments, note: null };
  const headers = (parsed.rows.find(isHeader) ?? parsed.rows[0] ?? [])
    .map((cell) => cell.replace(/[0-9£$€,._-]/g, "").trim())
    .filter(Boolean)
    .slice(0, 10);
  return {
    payments,
    note: `${buffer.length} bytes, columns ${parsed.rows[0]?.length ?? 0}, files ${parsed.entries.slice(0, 6).join(", ") || "none"}, headers ${headers.join(" | ") || "none"}.`,
  };
}

function isDownloadBlocked(detail: string): boolean {
  return /40003|3000000|BAD_PARAMS|signOM|l2l-finance/i.test(detail);
}

async function downloadReport(
  fileUrl: string,
  fileName: string,
  credentials: TemuCredentials,
  expiresAt?: number,
): Promise<{ payments: AccountPayment[]; note: string | null }> {
  const proxy = process.env.TEMU_PROXY_URL?.trim() || "https://145.241.234.131.sslip.io";
  const token = process.env.TEMU_PROXY_SECRET?.trim() ?? "";
  const hosts = [fileUrl];
  try {
    const url = new URL(fileUrl);
    if (url.hostname === "openapi-b-eu.temu.com") {
      url.hostname = "agentseller-eu.temu.com";
      hosts.push(url.toString());
    }
  } catch {
    // keep original url only
  }

  let lastDetail = "";
  for (const candidate of hosts) {
    const response = await fetch(`${proxy}/temu-file`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: candidate, headerSets: [fileAuthHeaders(credentials, candidate)] }),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const preview = buffer.subarray(0, 400).toString("utf8").trim();
    if (!response.ok || (preview.startsWith("{") && preview.includes("error_code"))) {
      lastDetail = responseDetail(preview || `HTTP ${response.status}`);
      console.error("Temu payment report download failed", {
        status: response.status,
        shape: fileShape(candidate),
        fileName,
        contentType: response.headers.get("content-type"),
        body: lastDetail.slice(0, 500),
        expiry: linkExpiry(expiresAt),
      });
      continue;
    }
    return parseTemuPaymentReport(buffer, fileName);
  }

  if (isDownloadBlocked(lastDetail)) {
    throw new Error(DOWNLOAD_BLOCKED_HINT);
  }
  throw new Error(
    `Temu payment report download failed from ${fileShape(fileUrl)}. ${linkExpiry(expiresAt)}. ${lastDetail.slice(0, 400)}`,
  );
}

async function withMallId(credentials: TemuCredentials): Promise<TemuCredentials> {
  if (credentials.mallId) return credentials;
  try {
    const info = await getTemuAccessTokenInfo(credentials);
    if (!info.mallId) return credentials;
    return { ...credentials, mallId: info.mallId };
  } catch {
    return credentials;
  }
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
  const stored = await getStoredTemuCredentials();
  if (!stored) return { payments: [], warning: null };
  const credentials = await withMallId(stored);

  const pending = await startPaymentReports(credentials, days);
  if (pending.length === 0) {
    return { payments: [], warning: "Invalid date range" };
  }

  const payments: AccountPayment[] = [];
  let warning: string | null = null;
  let emptyNote: string | null = null;

  for (let attempt = 0; attempt < 12 && pending.length > 0; attempt += 1) {
    if (attempt > 0) await wait(2000);
    const stillPending: Array<{ taskId: string; style: BillCallStyle }> = [];
    for (const job of pending) {
      const task = await readBillTask(credentials, job.taskId, job.style);
      if (task.fileUrl?.trim()) {
        const status = task.status?.trim() ?? "";
        if (status && !/success|finish|done|complete/i.test(status)) {
          if (/fail|error|cancel|time_out|timeout/i.test(status) || task.errorMessage?.trim()) {
            warning = task.errorMessage?.trim() || `Temu payment report ${status}.`;
            continue;
          }
          stillPending.push(job);
          continue;
        }
        try {
          const report = await downloadReport(
            task.fileUrl.trim(),
            task.fileName?.trim() || "",
            credentials,
            task.expiresAt,
          );
          if (report.payments.length === 0 && !emptyNote) emptyNote = report.note;
          payments.push(
            ...report.payments.map((row, index) => ({ ...row, id: `${job.taskId}-${index}` })),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Temu payment report download failed.";
          warning = message;
        }
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
        ? warning || emptyNote || "The Temu report downloaded, but it had no payment rows."
        : warning,
  };
}
