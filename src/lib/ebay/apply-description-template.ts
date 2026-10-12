export const DEFAULT_EBAY_DESCRIPTION_TEMPLATE = `<div style="width:100%;max-width:100%;margin:0 auto;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#111111;background:#ffffff;">
  <div style="background:#111111;border-top:4px solid #F47A12;padding:20px 16px 6px;text-align:center;">
    <div style="font-size:28px;line-height:1;font-weight:bold;letter-spacing:0.02em;color:#ffffff;"><span style="color:#F47A12;">TS</span> TRADE</div>
  </div>
  <div style="background:#111111;color:#ffffff;text-align:center;padding:8px 16px 18px;font-size:14px;line-height:1.4;">Tools and fixings for trade</div>
    <div style="padding:18px 16px 8px;">
    <div style="font-size:15px;line-height:1.55;color:#2b2b2b;word-wrap:break-word;overflow-wrap:anywhere;">{{body}}</div>
  </div>
  <div style="padding:8px 16px 16px;">
    <div style="background:#111111;color:#ffffff;border-radius:10px;padding:14px 16px;margin:0 0 8px;font-size:14px;line-height:1.4;"><span style="color:#F47A12;font-weight:bold;">Trade quality</span><br />Products chosen for site and workshop use.</div>
    <div style="background:#111111;color:#ffffff;border-radius:10px;padding:14px 16px;margin:0 0 8px;font-size:14px;line-height:1.4;"><span style="color:#F47A12;font-weight:bold;">UK dispatch</span><br />Sent from our UK warehouse.</div>
    <div style="background:#111111;color:#ffffff;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.4;"><span style="color:#F47A12;font-weight:bold;">Check before you buy</span><br />Confirm the size, quantity, and finish in the title.</div>
  </div>
  <div style="background:#111111;color:#ffffff;text-align:center;padding:16px;font-size:13px;line-height:1.5;">
    <div style="color:#F47A12;font-weight:bold;letter-spacing:0.06em;">TSTRADE.CO.UK</div>
    <div style="margin-top:4px;">The same stock is on our website.</div>
  </div>
</div>`;

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep the product text when the template is inserted again. */
export function cleanDescriptionBody(body: string, title: string): string {
  let html = body.trim();
  const wrapped = html.match(
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
): string {
  const productText = cleanDescriptionBody(body, title);
  if (template.includes("{{title}}") || template.includes("{{body}}")) {
    return template
      .replaceAll("{{title}}", title.trim())
      .replaceAll("{{body}}", productText);
  }
  return [template.trim(), productText].filter(Boolean).join("\n");
}
