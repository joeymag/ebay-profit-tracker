/** How many listings one bulk description request updates. */
export const DESCRIPTION_TEMPLATE_BATCH_SIZE = 6;

export const DEFAULT_EBAY_DESCRIPTION_TEMPLATE = `<style>
#ebay-description, #ebay-description * { box-sizing: border-box; }
#ebay-description { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2937; line-height: 1.6; background: #f9fafb; padding: 16px 0; font-size: 16px; }
#ebay-description a { color: #c2410c; text-decoration: none; }
#ebay-description .container { width: 100%; max-width: 1100px; margin: 0 auto; padding: 8px 16px; }
#ebay-description .block { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 20px; padding: 24px; margin-bottom: 16px; }
#ebay-description .brand { background: #111111; border-radius: 20px; border-top: 4px solid #F47A12; padding: 28px 16px 22px; text-align: center; }
#ebay-description .brand .logo { max-width: 280px; width: 100%; height: auto; display: block; margin: 0 auto 8px; }
#ebay-description .brand p { margin: 0 0 14px; color: #d9d9d9; }
#ebay-description h2 { font-size: 28px; line-height: 1.25; font-weight: 700; margin: 0 0 16px; color: #111827; }
#ebay-description .row { display: flex; flex-wrap: wrap; margin-left: -12px; margin-right: -12px; }
#ebay-description .span5, #ebay-description .span7, #ebay-description .span4 { padding-left: 12px; padding-right: 12px; min-width: 0; }
#ebay-description .span5 { flex: 0 0 41.666%; max-width: 41.666%; }
#ebay-description .span7 { flex: 0 0 58.333%; max-width: 58.333%; }
#ebay-description .span4 { flex: 0 0 33.333%; max-width: 33.333%; margin-bottom: 12px; }
#ebay-description .photo { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 16px; padding: 12px; }
#ebay-description .photo img { width: 100%; max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 12px; }
#ebay-description .btn { display: inline-block; margin: 4px; padding: 12px 18px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; }
#ebay-description .btn-primary { background: #F47A12; color: #111111; }
#ebay-description .btn-ghost { background: transparent; color: #F47A12; border: 1px solid #F47A12; }
#ebay-description .note { background: #f8fafc; border: 1px solid #e5e7eb; border-left: 4px solid #F47A12; border-radius: 12px; padding: 14px 16px; }
#ebay-description .note strong { display: block; margin-bottom: 4px; color: #111827; }
#ebay-description .foot { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; }
#ebay-description .foot img { max-width: 180px; width: 100%; height: auto; }
#ebay-description .muted { color: #6b7280; font-size: 14px; margin: 0; }
@media (max-width: 768px) {
  #ebay-description .span5, #ebay-description .span7, #ebay-description .span4 { flex: 0 0 100%; max-width: 100%; }
  #ebay-description td.span5, #ebay-description td.span7 { display: block; width: 100% !important; padding: 0 0 12px !important; }
  #ebay-description h2 { font-size: 22px; }
  #ebay-description .block { padding: 16px; border-radius: 14px; }
  #ebay-description .foot { justify-content: center; text-align: center; }
}
</style>
<div id="ebay-description">
  <div class="container">
    <div class="brand">
      <img class="logo" src="https://tstrade.co.uk/cdn/shop/t/3/assets/tstrade-logo.png?v=13904708887491951791788393307" alt="TS Trade" style="max-width:280px;width:100%;height:auto;display:block;margin:0 auto 8px;" />
      <p>Tools and fixings for trade professionals</p>
      <a class="btn btn-ghost" href="https://tstrade.co.uk/pages/contact">Contact us</a>
      <a class="btn btn-primary" href="https://tstrade.co.uk/collections/all">Shop</a>
    </div>
  </div>
  <div class="container">
    <div class="block">
      <h2>{{title}}</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
        <td class="span5" style="width:42%;vertical-align:top;padding-right:16px;"><div class="photo">{{image}}</div></td>
        <td class="span7" style="width:58%;vertical-align:top;"><div style="overflow-wrap:anywhere;"><!--ts-body-start-->{{body}}<!--ts-body-end--></div></td>
      </tr></table>
    </div>
  </div>
  <div class="container">
    <div class="block">
      <div class="row">
        <div class="span4"><div class="note" style="background:#f8fafc;border:1px solid #e5e7eb;border-left:4px solid #F47A12;border-radius:12px;padding:14px 16px;"><strong style="display:block;margin:0 0 4px;color:#111827;">Trade quality</strong>Products chosen for site and workshop use.</div></div>
        <div class="span4"><div class="note" style="background:#f8fafc;border:1px solid #e5e7eb;border-left:4px solid #F47A12;border-radius:12px;padding:14px 16px;"><strong style="display:block;margin:0 0 4px;color:#111827;">UK dispatch</strong>Sent from our UK warehouse.</div></div>
        <div class="span4"><div class="note" style="background:#f8fafc;border:1px solid #e5e7eb;border-left:4px solid #F47A12;border-radius:12px;padding:14px 16px;"><strong style="display:block;margin:0 0 4px;color:#111827;">Before you buy</strong>Check the size, quantity, and finish.</div></div>
      </div>
    </div>
  </div>
  <div class="container">
    <div class="block foot" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;">
      <img class="logo" src="https://tstrade.co.uk/cdn/shop/t/3/assets/tstrade-logo.png?v=13904708887491951791788393307" alt="TS Trade" style="max-width:180px;width:100%;height:auto;display:block;" />
      <p class="muted" style="color:#6b7280;font-size:14px;margin:0;">Dispatched from the UK. The same stock is on tstrade.co.uk.</p>
      <div>
        <a class="btn btn-primary" href="https://tstrade.co.uk/collections/all" style="display:inline-block;margin:4px;padding:12px 18px;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;background:#F47A12;color:#111111;">Shop</a>
        <a class="btn btn-ghost" href="https://tstrade.co.uk/pages/contact" style="display:inline-block;margin:4px;padding:12px 18px;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;background:transparent;color:#F47A12;border:1px solid #F47A12;">Contact us</a>
      </div>
    </div>
  </div>
</div>`;

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imageHtml(imageUrl: string | null | undefined): string {
  const src = imageUrl?.trim();
  if (!src) return "";
  return `<img src="${escapeHtml(src)}" alt="Product" style="width:100%;max-width:260px;height:auto;display:block;margin:0 auto;border:0;" />`;
}

const BOILERPLATE = [
  /^tools and fixings for trade professionals\.?$/i,
  /^ts trade\s*[—–-]?\s*uk seller, dispatched from the uk\.?$/i,
  /^dispatched from the uk\. the same stock is on tstrade\.co\.uk\.?$/i,
  /^products chosen for site and workshop use\.?$/i,
  /^sent from our uk warehouse\.?$/i,
  /^check the size, quantity, and finish\.?$/i,
  /^check the size, quantity, and finish in the title before you buy\.?$/i,
  /^(trade quality|uk dispatch|before you buy)$/i,
  /^(shop|contact us)$/i,
];

function isBoilerplate(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  return BOILERPLATE.some((pattern) => pattern.test(value));
}

function tagTolerant(sentence: string): RegExp {
  const parts = sentence
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(parts.join("(?:\\s|&nbsp;|<[^>]+>)*"), "gi");
}

/** Keep the product text when the template is inserted again. */
export function cleanDescriptionBody(body: string, title: string): string {
  let html = body.trim();
  for (let pass = 0; pass < 4; pass += 1) {
    const marked = html.match(/<!--ts-body-start-->([\s\S]*?)<!--ts-body-end-->/i);
    if (!marked?.[1]) break;
    html = marked[1].trim();
  }
  const wrapped = html.match(
    /overflow-wrap:anywhere;">([\s\S]*?)<\/div>\s*<\/td>\s*<\/tr>\s*<\/table>/i,
  );
  if (wrapped?.[1] && !html.includes("<!--ts-body-start-->")) {
    html = wrapped[1].trim();
  }

  html = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<img[^>]*tstrade-logo[^>]*>/gi, "")
    .replace(/<\/?div[^>]*>/gi, "")
    .replace(tagTolerant("TS Trade — UK seller, dispatched from the UK."), "")
    .replace(tagTolerant("Dispatched from the UK. The same stock is on tstrade.co.uk."), "")
    .replace(tagTolerant("Check the size, quantity, and finish in the title before you buy."), "")
    .replace(tagTolerant("Products chosen for site and workshop use."), "")
    .replace(tagTolerant("Sent from our UK warehouse."), "")
    .replace(tagTolerant("Tools and fixings for trade professionals"), "")
    .replace(/<hr[^>]*>/gi, "");

  const titleText = title.trim().toLowerCase();
  html = html.replace(
    /<(h[1-6]|p|li|strong|b|font|span)[^>]*>[\s\S]*?<\/\1>/gi,
    (element) => {
      const text = plainText(element).toLowerCase();
      if (!text) return "";
      if (titleText && text === titleText) return "";
      if (isBoilerplate(text)) return "";
      return element;
    },
  );

  if (titleText) {
    const escaped = title.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html
      .replace(
        new RegExp(
          `^(?:<(?:p|strong|b|font|span|br)[^>]*>\\s*)*${escaped}\\s*(?:</(?:p|strong|b|font|span)>\\s*)*`,
          "i",
        ),
        "",
      )
      .trim();
  }

  return html.replace(/<(p|span|strong|b|font)[^>]*>\s*<\/\1>/gi, "").trim();
}

export function applyDescriptionTemplate(
  template: string,
  title: string,
  body: string,
  imageUrl?: string | null,
): string {
  const productText = cleanDescriptionBody(body, title);
  const picture = imageHtml(imageUrl);
  if (
    template.includes("{{title}}") ||
    template.includes("{{body}}") ||
    template.includes("{{image}}")
  ) {
    return template
      .replaceAll("{{title}}", title.trim())
      .replaceAll("{{image}}", picture)
      .replaceAll("{{body}}", productText);
  }
  return [template.trim(), productText].filter(Boolean).join("\n");
}
