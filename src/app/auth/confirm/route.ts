import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  createSupabaseRouteHandlerClient,
  safeRedirectPath,
} from "@/lib/supabase/route-handler-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const defaultNext = type === "recovery" ? "/auth/reset-password" : "/";
  const next = safeRedirectPath(searchParams.get("next"), defaultNext);

  if (tokenHash && type) {
    const redirectUrl = new URL(next, request.url);
    const response = NextResponse.redirect(redirectUrl);
    const supabase = createSupabaseRouteHandlerClient(request, response);
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=auth_confirm_failed", request.url),
  );
}
