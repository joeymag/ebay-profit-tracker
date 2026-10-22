import { temuCall, temuCallFlat, temuCallValues, TemuApiError } from "@/lib/temu/client";
import type { TemuCredentials } from "@/lib/temu/config";

export type TemuGoodsSku = {
  goodsId: string | null;
  goodsName: string | null;
  /** Temu marketplace SKU id (matches order "Temu item sku id"). */
  skuId: string;
  /** Seller external SKU / barcode when set on Temu. */
  outSkuSn: string | null;
};

type GoodsListResult = {
  total?: number;
  goodsList?: Array<{
    goodsId?: number | string;
    goodsName?: string;
    outGoodsSn?: string;
    skuInfoList?: Array<{
      skuId?: number | string;
      skuSn?: string;
      outSkuSn?: string;
      extCode?: string;
    }>;
    outSkuSnList?: string[];
  }>;
};

async function queryGoodsPage(
  credentials: TemuCredentials,
  pageNo: number,
  pageSize: number,
): Promise<GoodsListResult> {
  const fields = {
    pageNo,
    pageSize,
    goodsStatusFilterType: 1,
  };

  try {
    return await temuCallValues<GoodsListResult>(
      credentials,
      "bg.local.goods.list.query",
      fields,
    );
  } catch (error) {
    if (!(error instanceof TemuApiError)) throw error;
  }

  try {
    return await temuCallFlat<GoodsListResult>(credentials, "bg.local.goods.list.query", {
      pageNo: String(pageNo),
      pageSize: String(pageSize),
      goodsStatusFilterType: "1",
    });
  } catch (error) {
    if (!(error instanceof TemuApiError)) throw error;
  }

  return temuCall<GoodsListResult>(credentials, "bg.local.goods.list.query", fields);
}

/**
 * List local Temu goods/SKUs for catalog linking (EU/UK local mall).
 */
export async function fetchTemuGoodsSkus(
  credentials: TemuCredentials,
  options?: { maxPages?: number },
): Promise<TemuGoodsSku[]> {
  const maxPages = Math.min(Math.max(options?.maxPages ?? 20, 1), 50);
  const pageSize = 100;
  const skus: TemuGoodsSku[] = [];
  const seen = new Set<string>();

  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const result = await queryGoodsPage(credentials, pageNo, pageSize);
    const batch = result.goodsList ?? [];
    for (const goods of batch) {
      const goodsId =
        goods.goodsId == null || goods.goodsId === ""
          ? null
          : String(goods.goodsId);
      const goodsName = goods.goodsName?.trim() || null;
      const skuInfos = goods.skuInfoList ?? [];
      if (skuInfos.length === 0) {
        continue;
      }
      for (const info of skuInfos) {
        const skuId =
          info.skuId == null || info.skuId === "" ? "" : String(info.skuId).trim();
        if (!skuId || seen.has(skuId)) continue;
        seen.add(skuId);
        const outSkuSn =
          info.outSkuSn?.trim() ||
          info.extCode?.trim() ||
          info.skuSn?.trim() ||
          null;
        skus.push({
          goodsId,
          goodsName,
          skuId,
          outSkuSn,
        });
      }
    }
    if (batch.length < pageSize) break;
  }

  return skus;
}
