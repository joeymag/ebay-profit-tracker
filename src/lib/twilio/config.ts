export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  testToNumber: string | null;
  isConfigured: boolean;
};

export function getTwilioConfig(): TwilioConfig {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim() || "";
  const testToNumber = process.env.TWILIO_TEST_TO_NUMBER?.trim() || null;

  return {
    accountSid,
    authToken,
    fromNumber,
    testToNumber,
    isConfigured: Boolean(accountSid && authToken && fromNumber),
  };
}
