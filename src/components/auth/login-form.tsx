"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserAuthClient } from "@/lib/supabase/browser-auth";

const URL_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed:
    "That sign-in link is invalid or expired. Request a new password reset email.",
  auth_confirm_failed:
    "That reset link is invalid or expired. Request a new password reset email.",
  reset_session_expired:
    "Your reset session expired. Request a new password reset email.",
  access_denied:
    "That email link is invalid or expired. Sign in with your password, or request a new reset email.",
  otp_expired:
    "That email link has expired. Sign in with your password, or request a new reset email.",
};

function resolveUrlError(searchParams: URLSearchParams): string | null {
  const errorCode = searchParams.get("error_code");
  if (errorCode === "otp_expired") {
    return URL_ERROR_MESSAGES.otp_expired!;
  }
  const error = searchParams.get("error");
  if (!error) return null;
  return URL_ERROR_MESSAGES[error] ?? "Sign-in failed.";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const urlErrorMessage = resolveUrlError(searchParams);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<string | null>(urlErrorMessage);

  // Expired Supabase email links include long error_description query strings.
  // Keep a short error= code for the message, strip the noisy extras once.
  useEffect(() => {
    const hasNoise =
      searchParams.has("error_description") || searchParams.has("error_code");
    if (!hasNoise) return;

    const clean = new URLSearchParams();
    const mapped =
      searchParams.get("error_code") === "otp_expired"
        ? "otp_expired"
        : searchParams.get("error") || "access_denied";
    clean.set("error", mapped);
    if (nextPath && nextPath !== "/") {
      clean.set("next", nextPath);
    }
    router.replace(`/login?${clean.toString()}`);
  }, [nextPath, router, searchParams]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResetSent(false);

    try {
      const supabase = createSupabaseBrowserAuthClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch {
      setError("Could not sign in. Check Supabase auth is configured.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email above, then click Forgot password.");
      return;
    }

    setResetLoading(true);
    setError(null);
    setResetSent(false);

    try {
      const supabase = createSupabaseBrowserAuthClient();
      const redirectTo = `${window.location.origin}/auth/confirm?next=/auth/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        { redirectTo },
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setResetSent(true);
    } catch {
      setError("Could not send reset email. Check Supabase auth is configured.");
    } finally {
      setResetLoading(false);
    }
  }

  const busy = loading || resetLoading;

  return (
    <Card className="surface-card w-full max-w-md border-primary/20">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
          <TrendingUp className="size-6" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Profit Tracker — authorized users only
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <button
                type="button"
                className="text-xs text-primary hover:underline disabled:opacity-50"
                onClick={handleForgotPassword}
                disabled={busy}
              >
                Forgot password?
              </button>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {resetSent ? (
            <p className="text-sm text-muted-foreground">
              Reset email sent. Open the link on the same site URL you use for
              this app (check the address bar matches your Supabase redirect
              URLs).
            </p>
          ) : null}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Users are created in Supabase Auth — there is no public sign-up page.
        </p>
      </CardContent>
    </Card>
  );
}
