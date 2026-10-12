export const DEFAULT_EBAY_DESCRIPTION_TEMPLATE = `<div style="font-family: Arial, sans-serif; color: #222; max-width: 800px; line-height: 1.5;">
  <h2 style="margin: 0 0 12px;">{{title}}</h2>
  <div>{{body}}</div>
  <hr style="margin: 24px 0; border: none; border-top: 1px solid #ddd;" />
  <p><strong>TS Trade</strong> — UK seller, dispatched from the UK.</p>
  <p>Check the size, quantity, and finish in the title before you buy.</p>
</div>`;

export function applyDescriptionTemplate(
  template: string,
  title: string,
  body: string,
): string {
  if (template.includes("{{title}}") || template.includes("{{body}}")) {
    return template.replaceAll("{{title}}", title).replaceAll("{{body}}", body);
  }
  return [template.trim(), body.trim()].filter(Boolean).join("\n");
}
