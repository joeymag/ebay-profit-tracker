import twilio from "twilio";

import { getTwilioConfig } from "@/lib/twilio/config";

/**
 * Normalize UK-friendly inputs to E.164.
 * Accepts +447..., 447..., 07..., or already-international numbers.
 */
export function normalizeUkPhone(input: string): string | null {
  const raw = input.trim().replace(/[\s()-]/g, "");
  if (!raw) return null;

  let digits = raw;
  if (digits.startsWith("+")) {
    digits = `+${digits.slice(1).replace(/\D/g, "")}`;
  } else {
    digits = digits.replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("0") && digits.length === 11) {
      digits = `44${digits.slice(1)}`;
    }
    digits = `+${digits}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
}

export async function sendSms(input: {
  to: string;
  body: string;
}): Promise<{ sid: string; to: string; from: string; status: string }> {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    throw new Error(
      "Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
    );
  }

  const to = normalizeUkPhone(input.to);
  if (!to) {
    throw new Error("Invalid phone number. Use +447… or 07… format.");
  }

  const body = input.body.trim();
  if (!body) {
    throw new Error("SMS body is required.");
  }

  const client = twilio(config.accountSid, config.authToken);
  const message = await client.messages.create({
    to,
    from: config.fromNumber,
    body,
  });

  return {
    sid: message.sid,
    to,
    from: config.fromNumber,
    status: message.status || "queued",
  };
}
