import { NextResponse } from "next/server";

import {
  getEbayDescriptionTemplate,
  saveEbayDescriptionTemplate,
} from "@/lib/ebay/description-template";

export async function GET() {
  try {
    const html = await getEbayDescriptionTemplate();
    return NextResponse.json({ ok: true, html });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load the description template.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let body: { html?: string };
  try {
    body = (await request.json()) as { html?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const html = body.html?.trim() ?? "";
  if (!html) {
    return NextResponse.json(
      { ok: false, error: "Template cannot be empty." },
      { status: 400 },
    );
  }
  if (html.length > 500_000) {
    return NextResponse.json(
      { ok: false, error: "Template is too long." },
      { status: 400 },
    );
  }

  try {
    await saveEbayDescriptionTemplate(html);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save the description template.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
