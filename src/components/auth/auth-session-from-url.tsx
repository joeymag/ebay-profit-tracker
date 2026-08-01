"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createSupabaseBrowserAuthClient } from "@/lib/supabase/browser-auth";

type AuthSessionFromUrlProps = {
  redirectPath?: string;
};

export function AuthSessionFromUrl({
  redirectPath = "/",
}: AuthSessionFromUrlProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    let cancelled = false;

    async function completeAuthFromUrl() {
      const supabase = createSupabaseBrowserAuthClient();
      const currentUrl = new URL(window.location.href);
      const code = currentUrl.searchParams.get("code");
      const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type") ?? currentUrl.searchParams.get("type");
      const nextPath =
        type === "recovery" ? "/auth/reset-password" : redirectPath;

      if (!code && !(accessToken && refreshToken)) {
        router.replace("/login?error=auth_callback_failed");
        return;
      }

      setVisible(true);

      try {
        if (code) {
          setMessage("Exchanging sign-in code…");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
        } else if (accessToken && refreshToken) {
          setMessage("Finishing sign-in…");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            throw error;
          }
        }

        if (cancelled) {
          return;
        }

        window.history.replaceState(null, "", window.location.pathname);
        router.replace(nextPath);
        router.refresh();
      } catch {
        if (!cancelled) {
          router.replace("/login?error=auth_callback_failed");
        }
      }
    }

    void completeAuthFromUrl();

    return () => {
      cancelled = true;
    };
  }, [redirectPath, router]);

  if (!visible) {
    return null;
  }

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
