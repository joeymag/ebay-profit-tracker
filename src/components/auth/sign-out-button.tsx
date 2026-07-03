"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserAuthClient } from "@/lib/supabase/browser-auth";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserAuthClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start text-muted-foreground"
      onClick={() => void signOut()}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      Sign out
    </Button>
  );
}
