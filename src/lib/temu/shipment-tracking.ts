import { TemuApiError, temuCall, temuCallFlat } from "@/lib/temu/client";
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

export type TemuShipmentTracking = {
  trackingNumbers: string[];
  carrier: string | null;
};

function uniqueNumbers(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))];
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

export async function fetchTemuShipmentTracking(
  credentials: TemuCredentials,
  parentOrderSn: string,
): Promise<TemuShipmentTracking> {
  const parent = parentOrderSn.trim();
  if (!parent) return { trackingNumbers: [], carrier: null };

  const detail = await loadOrderDetail(credentials, parent);
  const orderSns = uniqueNumbers((detail?.orderList ?? []).map((line) => line.orderSn));
  if (orderSns.length === 0) return { trackingNumbers: [], carrier: null };

  const trackingNumbers: string[] = [];
  let carrier: string | null = null;

  for (const orderSn of orderSns) {
    const shipment = await loadShipment(credentials, parent, orderSn);
    for (const info of shipment?.shipmentInfoDTO ?? []) {
      if (info.trackingNumber?.trim()) trackingNumbers.push(info.trackingNumber.trim());
      if (!carrier && info.carrierName?.trim()) carrier = info.carrierName.trim();
      for (const sub of info.subPackageShipmentInfoList ?? []) {
        if (sub.trackingNumber?.trim()) trackingNumbers.push(sub.trackingNumber.trim());
        if (!carrier && sub.carrierName?.trim()) carrier = sub.carrierName.trim();
      }
    }
  }

  return {
    trackingNumbers: uniqueNumbers(trackingNumbers),
    carrier,
  };
}
