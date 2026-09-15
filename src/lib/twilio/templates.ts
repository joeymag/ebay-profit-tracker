export type SmsTemplateId = "order_confirmed" | "order_dispatched";

export type SmsTemplateVars = {
  name?: string | null;
  orderNumber?: string | null;
  tracking?: string | null;
  storeName?: string | null;
};

const DEFAULT_STORE = "TS Trade";

const TEMPLATES: Record<SmsTemplateId, string> = {
  order_confirmed:
    "Hi {{name}}, thanks for your order {{order_number}} from {{store_name}}. We'll message you when it ships.",
  order_dispatched:
    "Hi {{name}}, good news — order {{order_number}} from {{store_name}} has been dispatched{{tracking_part}}.",
};

function clean(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function renderSmsTemplate(
  id: SmsTemplateId,
  vars: SmsTemplateVars = {},
): string {
  const storeName = clean(vars.storeName, DEFAULT_STORE);
  const name = clean(vars.name, "there");
  const orderNumber = clean(vars.orderNumber, "#0000");
  const tracking = vars.tracking?.trim() || "";
  const trackingPart = tracking ? `. Tracking: ${tracking}` : "";

  return TEMPLATES[id]
    .replaceAll("{{store_name}}", storeName)
    .replaceAll("{{name}}", name)
    .replaceAll("{{order_number}}", orderNumber)
    .replaceAll("{{tracking_part}}", trackingPart)
    .replaceAll("{{tracking}}", tracking || "n/a")
    .trim();
}

export function getSmsTemplatePreview(id: SmsTemplateId): string {
  return renderSmsTemplate(id, {
    name: "Alex",
    orderNumber: "#1042",
    tracking: "JD123456789GB",
    storeName: DEFAULT_STORE,
  });
}
