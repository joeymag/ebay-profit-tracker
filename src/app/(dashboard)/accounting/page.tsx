import { Suspense } from "react";

import { AccountingPanel } from "@/components/accounting/accounting-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default function AccountingPage() {
  return (
    <>
      <DashboardHeader
        title="Accounting"
        description="QuickBooks transactions from your connected company"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <AccountingPanel />
        </Suspense>
      </div>
    </>
  );
}
