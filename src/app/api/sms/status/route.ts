import { NextResponse } from "next/server";

import { getTwilioConfig } from "@/lib/twilio/config";

export async function GET() {
  const config = getTwilioConfig();
  return NextResponse.json({
    isConfigured: config.isConfigured,
    hasAccountSid: Boolean(config.accountSid),
    hasAuthToken: Boolean(config.authToken),
    hasFromNumber: Boolean(config.fromNumber),
    hasTestToNumber: Boolean(config.testToNumber),
    fromNumberMasked: config.fromNumber
      ? maskPhone(config.fromNumber)
      : null,
    testToNumberMasked: config.testToNumber
      ? maskPhone(config.testToNumber)
      : null,
  });
}

function maskPhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "****";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-2)}`;
}
