import {
  parseShopifyGid,
  shopifyAdminGraphql,
} from "@/lib/shopify/graphql";
import { fetchOrderShippingLabelCost } from "@/lib/shopify/shipping-labels";
import { updateOrderCosts } from "@/lib/orders/store";

/** Label purchase mutation is only on recent Admin API versions. */
export const SHOPIFY_SHIPPING_LABEL_API_VERSION = "2026-01";

export type LabelFulfillmentOrder = {
  id: string;
  numericId: number;
  status: string;
  requestStatus: string | null;
  fulfillable: boolean;
  destinationName: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
  locationName: string | null;
  lineItemCount: number;
};

export type PackageDimensionsCm = {
  length: number;
  width: number;
  height: number;
};

export type PurchaseShippingLabelInput = {
  fulfillmentOrderId: string;
  /** Total shipment weight in grams (items + packaging). */
  totalWeightGrams: number;
  /** Empty package weight in grams. */
  packageWeightGrams: number;
  dimensionsCm: PackageDimensionsCm;
  notifyCustomer?: boolean;
  shippingDatetime?: string;
};

export type PurchasedShippingLabel = {
  id: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  documentUrl: string | null;
};

export type ShippingLabelPurchaseStatus = {
  id: string;
  status: "PENDING_PURCHASE" | "PURCHASED" | "PURCHASE_FAILED" | string;
  done: boolean;
  errors: string[];
  labels: PurchasedShippingLabel[];
};

type OrderFulfillmentOrdersQuery = {
  order: {
    id: string;
    name: string;
    displayFulfillmentStatus: string | null;
    fulfillmentOrders: {
      nodes: Array<{
        id: string;
        status: string;
        requestStatus: string | null;
        fulfillAt: string | null;
        destination: {
          firstName: string | null;
          lastName: string | null;
          city: string | null;
          countryCode: string | null;
        } | null;
        assignedLocation: {
          name: string | null;
        } | null;
        lineItems: {
          nodes: Array<{ id: string; remainingQuantity: number }>;
        };
      }>;
    };
  } | null;
};

type PurchaseMutation = {
  shippingLabelPurchase: {
    shippingLabelPurchaseResult: {
      id: string;
      status: string;
      done: boolean;
    } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
};

type PurchaseStatusQuery = {
  node: {
    id: string;
    status: string;
    done: boolean;
    errors: Array<{ message: string }>;
    shippingLabels: Array<{
      id: string;
      trackingInfo: {
        number: string | null;
        url: string | null;
      } | null;
      shippingDocuments: Array<{
        documentType: string;
        url: string | null;
      }>;
    }>;
  } | null;
};

function graphqlShippingLabels<T>(
  query: string,
  variables?: Record<string, unknown>,
) {
  return shopifyAdminGraphql<T>(query, variables, {
    apiVersion: SHOPIFY_SHIPPING_LABEL_API_VERSION,
  });
}

export async function getLabelFulfillmentOrders(
  shopifyOrderId: number,
): Promise<{
  orderName: string | null;
  fulfillmentStatus: string | null;
  fulfillmentOrders: LabelFulfillmentOrder[];
}> {
  const data = await graphqlShippingLabels<OrderFulfillmentOrdersQuery>(
    `#graphql
    query OrderFulfillmentOrders($id: ID!) {
      order(id: $id) {
        id
        name
        displayFulfillmentStatus
        fulfillmentOrders(first: 20, displayable: true) {
          nodes {
            id
            status
            requestStatus
            fulfillAt
            destination {
              firstName
              lastName
              city
              countryCode
            }
            assignedLocation {
              name
            }
            lineItems(first: 50) {
              nodes {
                id
                remainingQuantity
              }
            }
          }
        }
      }
    }`,
    { id: `gid://shopify/Order/${shopifyOrderId}` },
  );

  if (!data.order) {
    throw new Error(`Shopify order ${shopifyOrderId} was not found.`);
  }

  const openStatuses = new Set(["OPEN", "IN_PROGRESS", "SCHEDULED"]);

  const fulfillmentOrders = data.order.fulfillmentOrders.nodes
    .filter((node) => openStatuses.has(node.status))
    .map((node) => {
      const remaining = node.lineItems.nodes.reduce(
        (sum, item) => sum + (item.remainingQuantity ?? 0),
        0,
      );
      const destinationName = [node.destination?.firstName, node.destination?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return {
        id: node.id,
        numericId: parseShopifyGid(node.id),
        status: node.status,
        requestStatus: node.requestStatus,
        fulfillable: remaining > 0,
        destinationName: destinationName || null,
        destinationCity: node.destination?.city ?? null,
        destinationCountry: node.destination?.countryCode ?? null,
        locationName: node.assignedLocation?.name ?? null,
        lineItemCount: remaining,
      } satisfies LabelFulfillmentOrder;
    })
    .filter((fo) => fo.fulfillable);

  return {
    orderName: data.order.name,
    fulfillmentStatus: data.order.displayFulfillmentStatus,
    fulfillmentOrders,
  };
}

export async function purchaseShopifyShippingLabel(
  input: PurchaseShippingLabelInput,
): Promise<{ purchaseResultId: string; status: string }> {
  const shippingDatetime =
    input.shippingDatetime?.trim() ||
    new Date(Date.now() + 60_000).toISOString();

  const data = await graphqlShippingLabels<PurchaseMutation>(
    `#graphql
    mutation PurchaseShippingLabel($shippingLabelPurchase: ShippingLabelPurchaseInput!) {
      shippingLabelPurchase(shippingLabelPurchase: $shippingLabelPurchase) {
        shippingLabelPurchaseResult {
          id
          status
          done
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      shippingLabelPurchase: {
        fulfillmentOrderId: input.fulfillmentOrderId,
        notifyCustomer: input.notifyCustomer ?? false,
        shippingDatetime,
        totalWeight: {
          value: input.totalWeightGrams,
          unit: "GRAMS",
        },
        packageInfo: {
          customPackage: {
            type: "BOX",
            weight: {
              value: input.packageWeightGrams,
              unit: "GRAMS",
            },
            dimensions: {
              length: input.dimensionsCm.length,
              width: input.dimensionsCm.width,
              height: input.dimensionsCm.height,
              unit: "CENTIMETERS",
            },
          },
        },
      },
    },
  );

  const payload = data.shippingLabelPurchase;
  if (payload.userErrors.length) {
    throw new Error(payload.userErrors.map((e) => e.message).join("; "));
  }

  const result = payload.shippingLabelPurchaseResult;
  if (!result?.id) {
    throw new Error("Shopify did not return a label purchase result.");
  }

  return { purchaseResultId: result.id, status: result.status };
}

export async function getShopifyShippingLabelPurchaseStatus(
  purchaseResultId: string,
): Promise<ShippingLabelPurchaseStatus> {
  const data = await graphqlShippingLabels<PurchaseStatusQuery>(
    `#graphql
    query ShippingLabelPurchaseStatus($id: ID!) {
      node(id: $id) {
        ... on ShippingLabelPurchaseResult {
          id
          status
          done
          errors {
            message
          }
          shippingLabels {
            id
            trackingInfo {
              number
              url
            }
            shippingDocuments {
              documentType
              url
            }
          }
        }
      }
    }`,
    { id: purchaseResultId },
  );

  if (!data.node) {
    throw new Error("Label purchase result was not found.");
  }

  return {
    id: data.node.id,
    status: data.node.status,
    done: data.node.done,
    errors: data.node.errors.map((e) => e.message),
    labels: data.node.shippingLabels.map((label) => ({
      id: label.id,
      trackingNumber: label.trackingInfo?.number ?? null,
      trackingUrl: label.trackingInfo?.url ?? null,
      documentUrl:
        label.shippingDocuments.find((doc) => doc.url)?.url ?? null,
    })),
  };
}

/** After a successful purchase, pull the label cost into our order record. */
export async function syncPostageCostAfterLabelPurchase(
  shopifyOrderId: number,
): Promise<number | null> {
  const cost = await fetchOrderShippingLabelCost(shopifyOrderId);
  if (cost > 0) {
    await updateOrderCosts(shopifyOrderId, { shippingLabelCost: cost });
    return cost;
  }
  return null;
}
