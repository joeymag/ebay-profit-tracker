export const DEFAULT_EBAY_DESCRIPTION_TEMPLATE = `<style>@media (max-width:560px){.ts-photo,.ts-copy{display:block !important;width:100% !important;border-right:0 !important;}}</style><div style="width:100%;max-width:100%;margin:0 auto;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#111111;background:#ffffff;">
  <div style="background:#111111;border-top:4px solid #F47A12;padding:22px 16px 18px;text-align:center;">
    <div style="font-size:11px;line-height:1.2;font-weight:bold;letter-spacing:0.22em;color:#F47A12;">UK TRADE SUPPLIER</div>
    <div style="margin-top:8px;font-size:30px;line-height:1;font-weight:bold;letter-spacing:0.04em;color:#ffffff;"><span style="color:#F47A12;">TS</span> TRADE</div>
    <div style="margin-top:8px;font-size:14px;line-height:1.4;color:#d9d9d9;">Tools and fixings for trade professionals</div>
    <div style="margin-top:14px;">
      <a href="https://tstrade.co.uk/pages/contact" style="display:inline-block;margin:4px;padding:8px 16px;border:1px solid #F47A12;border-radius:4px;color:#F47A12;font-size:13px;font-weight:bold;line-height:1.2;text-decoration:none;">Contact us</a>
      <a href="https://tstrade.co.uk/collections/all" style="display:inline-block;margin:4px;padding:8px 16px;border:1px solid #F47A12;border-radius:4px;background:#F47A12;color:#111111;font-size:13px;font-weight:bold;line-height:1.2;text-decoration:none;">Shop</a>
    </div>
  </div>
  <div style="padding:16px;">
    <table style="width:100%;border-collapse:separate;border:1px solid #111111;background:#ffffff;" cellpadding="0" cellspacing="0">
      <tr>
        <td class="ts-photo" style="width:36%;vertical-align:middle;padding:12px;border-right:1px solid #e6e6e6;text-align:center;background:#fafafa;">{{image}}</td>
        <td class="ts-copy" style="width:64%;vertical-align:top;padding:14px 16px;">
          <div style="font-size:15px;line-height:1.55;color:#2b2b2b;word-wrap:break-word;overflow-wrap:anywhere;">{{body}}</div>
        </td>
      </tr>
    </table>
  </div>
  <div style="padding:8px 16px 16px;">
    <div style="background:#111111;border-bottom:4px solid #F47A12;padding:20px 16px;text-align:center;color:#ffffff;">
      <div style="font-size:13px;line-height:1;font-weight:bold;letter-spacing:0.08em;"><span style="color:#F47A12;">TS</span> TRADE</div>
      <div style="margin-top:10px;font-size:14px;line-height:1.6;">
        <a href="https://tstrade.co.uk/collections/all" style="color:#F47A12;font-weight:bold;text-decoration:none;">Shop</a>
        <span style="color:#666666;"> · </span>
        <a href="https://tstrade.co.uk/pages/contact" style="color:#F47A12;font-weight:bold;text-decoration:none;">Contact us</a>
      </div>
      <div style="margin-top:8px;font-size:13px;line-height:1.5;color:#d9d9d9;">Dispatched from our UK warehouse.<br />Check the size, quantity, and finish before you buy.</div>
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

/** Keep the product text when the template is inserted again. */
export function cleanDescriptionBody(body: string, title: string): string {
  let html = body.trim();
  const wrapped = html.match(
    /overflow-wrap:anywhere;">([\s\S]*?)<\/div>\s*<\/td>\s*<\/tr>\s*<\/table>[\s\S]*?<div style="padding:8px 16px 16px;">/i,
  ) ?? html.match(
    /overflow-wrap:anywhere;">([\s\S]*?)<\/div>\s*<div style="padding:8px 16px 16px;">/i,
  );
  if (wrapped?.[1]) {
    html = wrapped[1].trim();
  }

  const titleText = title.trim();
  html = html.replace(/<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/gi, (heading) => {
    if (!titleText) return heading;
    return plainText(heading).toLowerCase() === titleText.toLowerCase() ? "" : heading;
  });

  html = html
    .replace(/TS Trade\s*[—–-]\s*UK seller, dispatched from the UK\.?/gi, "")
    .replace(/Check the size, quantity, and finish in the title before you buy\.?/gi, "")
    .replace(/<hr[^>]*>/gi, "")
    .replace(/<(p|div)[^>]*>\s*<\/\1>/gi, "")
    .trim();

  if (titleText) {
    const escaped = titleText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html
      .replace(
        new RegExp(
          `^(?:<(?:p|div|strong|b)[^>]*>\\s*)*${escaped}\\s*(?:</(?:p|div|strong|b)>\\s*)*`,
          "i",
        ),
        "",
      )
      .trim();
  }

  return html;
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
