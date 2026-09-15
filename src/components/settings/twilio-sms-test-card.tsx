"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SmsStatus = {
  isConfigured: boolean;
  hasAccountSid: boolean;
  hasAuthToken: boolean;
  hasFromNumber: boolean;
  hasTestToNumber: boolean;
  fromNumberMasked: string | null;
  testToNumberMasked: string | null;
};

type TestResult =
  | { ok: true; message: string; sid?: string; status?: string }
  | { ok: false; error: string };

export function TwilioSmsTestCard() {
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState(
    "TS Trade test SMS — Twilio is connected.",
  );
  const [result, setResult] = useState<TestResult | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sms/status");
      const data = (await res.json()) as SmsStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function sendTest() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      const data = (await res.json()) as TestResult & { message?: string };
      if (!data.ok) {
        setResult({ ok: false, error: data.error || "Send failed." });
        return;
      }
      setResult({
        ok: true,
        message: data.message || "Test SMS sent.",
        sid: "sid" in data ? (data as { sid?: string }).sid : undefined,
        status:
          "status" in data ? (data as { status?: string }).status : undefined,
      });
    } catch {
      setResult({ ok: false, error: "Could not reach the SMS test endpoint." });
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking Twilio…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {status?.isConfigured ? (
          <Badge className="bg-green-600">Configured</Badge>
        ) : (
          <Badge variant="destructive">Not configured</Badge>
        )}
        {status?.fromNumberMasked ? (
          <span className="text-xs text-muted-foreground">
            From {status.fromNumberMasked}
          </span>
        ) : null}
        {status?.testToNumberMasked ? (
          <span className="text-xs text-muted-foreground">
            Default to {status.testToNumberMasked}
          </span>
        ) : null}
      </div>

      {!status?.isConfigured ? (
        <p className="text-sm text-muted-foreground">
          Add <code className="text-xs">TWILIO_ACCOUNT_SID</code>,{" "}
          <code className="text-xs">TWILIO_AUTH_TOKEN</code>, and{" "}
          <code className="text-xs">TWILIO_FROM_NUMBER</code> to{" "}
          <code className="text-xs">.env.local</code>, then restart the dev
          server.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="sms-to">
                Send test to
              </label>
              <Input
                id="sms-to"
                placeholder={
                  status.hasTestToNumber
                    ? "Uses TWILIO_TEST_TO_NUMBER if blank"
                    : "+447… or 07…"
                }
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="sms-body">
                Message
              </label>
              <Input
                id="sms-body"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>
          </div>

          <Button
            type="button"
            disabled={sending}
            onClick={() => void sendTest()}
          >
            {sending ? (
              <>
                <Loader2 className="animate-spin" />
                Sending…
              </>
            ) : (
              "Send test SMS"
            )}
          </Button>
        </>
      )}

      {result ? (
        <p
          className={
            result.ok
              ? "text-sm text-green-700 dark:text-green-400"
              : "text-sm text-destructive"
          }
        >
          {result.ok ? result.message : result.error}
        </p>
      ) : null}
    </div>
  );
}
