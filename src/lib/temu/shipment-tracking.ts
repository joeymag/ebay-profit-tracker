import { TemuApiError, temuCall, temuCallFlat, temuCallValues } from "@/lib/temu/client";
import type { TemuCredentials } from "@/lib/temu/config";

type TemuOrderDetail = {
  orderList?: Array<{
    orderSn?: string;
    packageSnInfo?: Array<{ packageSn?: string }>;
  }>;
};

type TemuShipmentInfo = {
  shipmentInfoDTO?: Array<{
    carrierId?: number | string;
    carrierName?: string;
    trackingNumber?: string;
    packageSn?: string;
    subPackageShipmentInfoList?: Array<{
      carrierName?: string;
      trackingNumber?: string;
      packageSn?: string;
    }>;
  }>;
};

type TemuShipmentResult = {
  packageInfoResultList?: Array<{
    packageSn?: string;
    trackingNumber?: string;
    shippingCompanyName?: string;
    estimatedAmount?: string | number;
    estimatedText?: string;
    estimatedCurrencyCode?: string;
    shippingLabelStatus?: number;
  }>;
};

export type TemuShipmentTracking = {
  trackingNumbers: string[];
  carrier: string | null;
  /** Seller buy-shipping label cost from Temu (GBP major units). */
  labelCost: number | null;
  packageSns: string[];
};

function uniqueNumbers(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))];
}

/** Parse Temu money strings like "£2.16" or numeric amounts. */
export function parseTemuLabelAmount(
  value: string | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? Math.round(value * 100) / 100 : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  // Prefer the first number before any comma (estimatedText is "£2.16,3-4 work days").
  const head = text.split(",")[0] ?? text;
  const match = head.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

async function loadOrderDetail(
  credentials: TemuCredentials,
  parentOrderSn: string,
): Promise<TemuOrderDetail | null> {
  try {
    return await temuCallFlat<TemuOrderDetail>(credentials, "bg.order.detail.v2.get", {
      parentOrderSn,
    });
  } catch (error) {
    if (!(error instanceof TemuApiError) || !/invalid param/i.test(error.message)) {
      throw error;
    }
    try {
      return await temuCall<TemuOrderDetail>(credentials, "bg.order.detail.v2.get", {
        parentOrderSn,
      });
    } catch {
      return null;
    }
  }
}

async function loadShipment(
  credentials: TemuCredentials,
  parentOrderSn: string,
  orderSn: string,
): Promise<TemuShipmentInfo | null> {
  try {
    return await temuCallFlat<TemuShipmentInfo>(credentials, "bg.logistics.shipment.v2.get", {
      parentOrderSn,
      orderSn,
    });
  } catch (error) {
    if (
      error instanceof TemuApiError &&
      /invalid param|not found|no shipment|BUSINESS_SERVICE_ERROR/i.test(error.message)
    ) {
      try {
        return await temuCall<TemuShipmentInfo>(credentials, "bg.logistics.shipment.v2.get", {
          parentOrderSn,
          orderSn,
        });
      } catch {
        return null;
      }
    }
    if (error instanceof TemuApiError) return null;
    throw error;
  }
}

/**
 * Buy-shipping label quote / tracking for packages.
 * EU local stores need flat packageSnList (JSON array string), not nested request.
 */
async function loadShipmentResult(
  credentials: TemuCredentials,
  packageSns: string[],
): Promise<TemuShipmentResult | null> {
  if (packageSns.length === 0) return null;
  const listJson = JSON.stringify(packageSns);
  try {
    // EU local: flat packageSnList as a JSON array string works; nested often returns [].
    return await temuCallFlat<TemuShipmentResult>(
      credentials,
      "bg.logistics.shipment.result.get",
      { packageSnList: listJson },
    );
  } catch (error) {
    if (!(error instanceof TemuApiError)) throw error;
    try {
      return await temuCallValues<TemuShipmentResult>(
        credentials,
        "bg.logistics.shipment.result.get",
        { packageSnList: listJson },
      );
    } catch {
      try {
        return await temuCall<TemuShipmentResult>(credentials, "bg.logistics.shipment.result.get", {
          packageSnList: packageSns,
        });
      } catch {
        return null;
      }
    }
  }
}

export async function fetchTemuShipmentTracking(
  credentials: TemuCredentials,
  parentOrderSn: string,
): Promise<TemuShipmentTracking> {
  const parent = parentOrderSn.trim();
  if (!parent) {
    return { trackingNumbers: [], carrier: null, labelCost: null, packageSns: [] };
  }

  const detail = await loadOrderDetail(credentials, parent);
  const orderSns = uniqueNumbers((detail?.orderList ?? []).map((line) => line.orderSn));
  const packageSnBag: string[] = [];
  for (const line of detail?.orderList ?? []) {
    for (const pkg of line.packageSnInfo ?? []) {
      if (pkg.packageSn?.trim()) packageSnBag.push(pkg.packageSn.trim());
    }
  }

  const trackingNumbers: string[] = [];
  let carrier: string | null = null;

  for (const orderSn of orderSns) {
    const shipment = await loadShipment(credentials, parent, orderSn);
    for (const info of shipment?.shipmentInfoDTO ?? []) {
      if (info.trackingNumber?.trim()) trackingNumbers.push(info.trackingNumber.trim());
      if (info.packageSn?.trim()) packageSnBag.push(info.packageSn.trim());
      if (!carrier && info.carrierName?.trim()) carrier = info.carrierName.trim();
      for (const sub of info.subPackageShipmentInfoList ?? []) {
        if (sub.trackingNumber?.trim()) trackingNumbers.push(sub.trackingNumber.trim());
        if (sub.packageSn?.trim()) packageSnBag.push(sub.packageSn.trim());
        if (!carrier && sub.carrierName?.trim()) carrier = sub.carrierName.trim();
      }
    }
  }

  const packages = uniqueNumbers(packageSnBag);
  let labelCost: number | null = null;
  if (packages.length > 0) {
    const result = await loadShipmentResult(credentials, packages);
    for (const pkg of result?.packageInfoResultList ?? []) {
      if (pkg.trackingNumber?.trim()) trackingNumbers.push(pkg.trackingNumber.trim());
      if (!carrier && pkg.shippingCompanyName?.trim()) {
        carrier = pkg.shippingCompanyName.trim();
      }
      const amount = parseTemuLabelAmount(pkg.estimatedAmount ?? pkg.estimatedText);
      if (amount != null) {
        labelCost = (labelCost ?? 0) + amount;
      }
    }
    if (labelCost != null) {
      labelCost = Math.round(labelCost * 100) / 100;
    }
  }

  return {
    trackingNumbers: uniqueNumbers(trackingNumbers),
    carrier,
    labelCost,
    packageSns: packages,
  };
}
