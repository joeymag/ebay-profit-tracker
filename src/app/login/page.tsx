import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="dashboard-canvas flex min-h-svh items-center justify-center bg-background p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
