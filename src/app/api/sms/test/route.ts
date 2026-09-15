import { NextResponse } from "next/server";

import { getTwilioConfig } from "@/lib/twilio/config";
import { normalizeUkPhone, sendSms } from "@/lib/twilio/sms";

export async function POST(request: Request) {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONFIGURED",
        error:
          "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to .env.local / Vercel.",
      },
      { status: 400 },
    );
  }

  let body: { to?: unknown; message?: unknown };
  try {
    body = (await request.json()) as { to?: unknown; message?: unknown };
  } catch {
    body = {};
  }

  const requestedTo =
    typeof body.to === "string" && body.to.trim()
      ? body.to.trim()
      : config.testToNumber;

  if (!requestedTo) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Enter a phone number, or set TWILIO_TEST_TO_NUMBER in .env.local.",
      },
      { status: 400 },
    );
  }

  const to = normalizeUkPhone(requestedTo);
  if (!to) {
    return NextResponse.json(
      { ok: false, error: "Invalid phone number. Use +447… or 07… format." },
      { status: 400 },
    );
  }

  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "TS Trade test SMS — Twilio is connected.";

  try {
    const result = await sendSms({ to, body: message });
    return NextResponse.json({
      ok: true,
      sid: result.sid,
      to: result.to,
      from: result.from,
      status: result.status,
      message: `Test SMS sent to ${result.to} (${result.status}).`,
    });
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : "Failed to send test SMS.";
    return NextResponse.json({ ok: false, error: errMessage }, { status: 502 });
  }
}
