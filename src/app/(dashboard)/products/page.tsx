import { DashboardHeader } from "@/components/layout/dashboard-header";
import { LineItemImage } from "@/components/orders/line-item-image";
import { ProductCostInput } from "@/components/products/product-cost-input";
import { SyncProductsButton } from "@/components/products/sync-products-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getProducts, syncProductsFromOrders } from "@/lib/products/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const configured = isSupabaseConfigured();
  let products = configured ? await getProducts() : [];

  if (configured && products.length === 0) {
    await syncProductsFromOrders();
    products = await getProducts();
  }
  const withCost = products.filter((p) => p.unitCost != null).length;
  const missingCost = products.length - withCost;

  return (
    <>
      <DashboardHeader
        title="Products"
        description="Set unit costs here — orders link automatically by SKU"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        {!configured ? (
          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Supabase required</CardTitle>
              <CardDescription>
                Add Supabase env vars to use the products catalog.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
              <SyncProductsButton />
              <p className="text-base text-muted-foreground">
                {products.length} products · {withCost} with cost set
                {missingCost > 0 ? ` · ${missingCost} need cost` : ""}
              </p>
            </div>

            <Card className="surface-card overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20">
                <CardTitle>Product catalog</CardTitle>
                <CardDescription>
                  Enter the cost you pay per unit (ex-VAT). Temu, eBay, and Amazon
                  orders add VAT in profit calculations. Import Temu SKUs after
                  syncing orders.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0 pt-0">
                <div className="overflow-x-auto">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16 pl-6" />
                        <TableHead className="w-[36%]">Product</TableHead>
                        <TableHead className="w-[16%]">SKU</TableHead>
                        <TableHead className="w-[14%]">Temu SKU</TableHead>
                        <TableHead className="w-[18%]">Unit cost</TableHead>
                        <TableHead className="w-[10%] pr-6 text-right">
                          In orders
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-24 whitespace-normal text-center text-muted-foreground"
                          >
                            Click &quot;Import SKUs from orders&quot; to build
                            your catalog from synced orders.
                          </TableCell>
                        </TableRow>
                      ) : (
                        products.map((product, i) => (
                          <TableRow
                            key={product.sku}
                            className={
                              i % 2 === 0
                                ? "border-border/40 bg-muted/20"
                                : "border-border/40"
                            }
                          >
                            <TableCell className="pl-6 align-top">
                              <LineItemImage
                                src={product.imageUrl}
                                alt={product.title}
                              />
                            </TableCell>
                            <TableCell className="min-w-0 whitespace-normal align-top text-base font-medium">
                              <p className="line-clamp-2 break-words leading-snug">
                                {product.title}
                              </p>
                            </TableCell>
                            <TableCell className="min-w-0 align-top whitespace-normal">
                              <Badge
                                variant="outline"
                                className="max-w-full truncate bg-background font-mono text-sm font-medium"
                                title={product.sku}
                              >
                                {product.sku}
                              </Badge>
                            </TableCell>
                            <TableCell className="min-w-0 align-top whitespace-normal">
                              {product.temuSku ? (
                                <Badge
                                  variant="outline"
                                  className="max-w-full truncate border-orange-500/30 bg-orange-500/10 font-mono text-sm font-medium text-orange-800 dark:text-orange-300"
                                  title={product.temuSku}
                                >
                                  {product.temuSku}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <ProductCostInput
                                sku={product.sku}
                                initialCost={product.unitCost}
                              />
                            </TableCell>
                            <TableCell className="pr-6 text-right tabular-nums text-muted-foreground">
                              {product.orderLineCount}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
