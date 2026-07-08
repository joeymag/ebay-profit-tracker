import { Suspense } from "react";

import { EbayMessagesPanel } from "@/components/ebay-messages/ebay-messages-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default function EbayMessagesPage() {
  return (
    <>
      <DashboardHeader
        title="eBay messages"
        description="Send and receive buyer messages via eBay"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <EbayMessagesPanel />
        </Suspense>
      </div>
    </>
  );
}
