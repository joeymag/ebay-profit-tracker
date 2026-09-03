import { DashboardHeader } from "@/components/layout/dashboard-header";
import { LineItemImage } from "@/components/orders/line-item-image";
import { ProductSearchFilterBar } from "@/components/filters/product-search-filter-bar";
import { PrintBagLabelButton } from "@/components/products/print-bag-label-button";
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
import { filterProductsBySearch } from "@/lib/products/search";
import { getProducts, syncProductsFromShopify } from "@/lib/products/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type ProductsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const searchQuery = params.q?.trim() ?? "";
  const configured = isSupabaseConfigured();
  let products = configured ? await getProducts() : [];

  if (configured && products.length === 0) {
    await syncProductsFromShopify();
    products = await getProducts();
  }

  const filteredProducts = filterProductsBySearch(products, searchQuery);
  const withCost = products.filter((p) => p.unitCost != null).length;
  const missingCost = products.length - withCost;

  return (
    <>
      <DashboardHeader
        title="Products"
        description="Set unit costs for Shopify products — orders link automatically by SKU"
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
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
                <SyncProductsButton />
                <ProductSearchFilterBar className="min-w-[16rem] flex-1" />
              </div>
              <p className="text-base text-muted-foreground">
                {searchQuery
                  ? `${filteredProducts.length} of ${products.length} matching`
                  : `${products.length} products`}
                {" · "}
                {withCost} with cost set
                {missingCost > 0 ? ` · ${missingCost} need cost` : ""}
              </p>
            </div>

            <Card className="surface-card overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20">
                <CardTitle>Product catalog</CardTitle>
                <CardDescription>
                  Synced from your Shopify product catalog. Enter the cost you pay
                  per unit (ex-VAT). Temu, eBay, and Amazon orders add VAT in profit
                  calculations.
                  {searchQuery ? ` Showing matches for “${searchQuery}”.` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0 pt-0">
                <div className="overflow-x-auto">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16 pl-6" />
                        <TableHead className="w-[32%]">Product</TableHead>
                        <TableHead className="w-[14%]">SKU</TableHead>
                        <TableHead className="w-[12%]">Temu SKU</TableHead>
                        <TableHead className="w-[16%]">Unit cost</TableHead>
                        <TableHead className="w-[10%] text-right">
                          In orders
                        </TableHead>
                        <TableHead className="w-[10%] pr-6 text-right">
                          Label
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="h-24 whitespace-normal text-center text-muted-foreground"
                          >
                            Click &quot;Sync from Shopify&quot; to load your
                            product catalog.
                          </TableCell>
                        </TableRow>
                      ) : filteredProducts.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="h-24 whitespace-normal text-center text-muted-foreground"
                          >
                            No products match &quot;{searchQuery}&quot;.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredProducts.map((product, i) => (
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
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {product.orderLineCount}
                            </TableCell>
                            <TableCell className="pr-6 text-right">
                              <PrintBagLabelButton sku={product.sku} />
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
