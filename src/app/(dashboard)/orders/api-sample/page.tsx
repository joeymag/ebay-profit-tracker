import Link from "next/link";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getShopifyOrderSample } from "@/lib/shopify/order-sample";
import { cn } from "@/lib/utils";

export default async function ApiSamplePage() {
  const sample = await getShopifyOrderSample();
  const payload = sample
    ? JSON.stringify({ ok: true, ...sample }, null, 2)
    : JSON.stringify({ ok: false, error: "No orders found" }, null, 2);

  return (
    <>
      <DashboardHeader
        title="Shopify API sample"
        description="Raw order payload from your store"
      />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/shopify/orders/sample"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants()}
          >
            Open JSON API in new tab
          </a>
          <Link href="/orders" className={cn(buttonVariants({ variant: "outline" }))}>
            Back to orders
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Field summary</CardTitle>
            <CardDescription>
              Top-level order fields returned by Shopify REST Admin API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-4 text-xs">
              {sample?.fieldSummary.join("\n") ?? "No data"}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line item fields</CardTitle>
            <CardDescription>
              Fields on each line_items[] entry (SKU, price, vendor, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-4 text-xs">
              {sample?.lineItemFieldSummary.join("\n") ?? "No data"}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Full response log</CardTitle>
            <CardDescription>
              Raw order + what we currently store + field index
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
              {payload}
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
