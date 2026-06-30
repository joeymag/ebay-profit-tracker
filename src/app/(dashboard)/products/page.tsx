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
                  Enter the cost you pay per unit. When orders sync, line items
                  match by SKU and profit is calculated automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0 pt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16 pl-6" />
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Unit cost</TableHead>
                        <TableHead className="pr-6 text-right">In orders</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="h-24 text-center text-muted-foreground"
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
                            <TableCell className="pl-6">
                              <LineItemImage
                                src={product.imageUrl}
                                alt={product.title}
                              />
                            </TableCell>
                            <TableCell className="max-w-md text-base font-medium">
                              {product.title}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="font-mono text-sm font-medium"
                              >
                                {product.sku}
                              </Badge>
                            </TableCell>
                            <TableCell>
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
