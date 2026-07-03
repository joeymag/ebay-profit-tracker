"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { LineItemImage } from "@/components/orders/line-item-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { OutOfStockItem } from "@/lib/shopify/inventory";

type OutOfStockResponse =
  | { ok: true; count: number; items: OutOfStockItem[] }
  | { ok: false; error: string };

type OutOfStockListProps = {
  refreshKey?: number;
  onSelectSku: (sku: string) => void;
};

export function OutOfStockList({ refreshKey = 0, onSelectSku }: OutOfStockListProps) {
  const [items, setItems] = useState<OutOfStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/shopify/inventory/out-of-stock");
      const data = (await res.json()) as OutOfStockResponse;

      if (!data.ok) {
        setError(data.error);
        setItems([]);
        return;
      }

      setItems(data.items);
    } catch {
      setError("Could not load out-of-stock items.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems, refreshKey]);

  return (
    <Card className="surface-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Out of stock
          </CardTitle>
          <CardDescription>
            Tracked Shopify variants with zero available inventory. Click a row to
            scan and update stock.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadItems()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {loading ? (
          <div className="flex items-center gap-2 px-6 pb-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading Shopify inventory…
          </div>
        ) : error ? (
          <p className="px-6 pb-6 text-sm text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No out-of-stock tracked items found in Shopify.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 pl-6" />
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Units sold</TableHead>
                  <TableHead className="pr-6 text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow
                    key={item.sku}
                    className={
                      index % 2 === 0
                        ? "cursor-pointer border-border/40 bg-muted/20 hover:bg-muted/40"
                        : "cursor-pointer border-border/40 hover:bg-muted/30"
                    }
                    onClick={() => onSelectSku(item.sku)}
                  >
                    <TableCell className="pl-6">
                      <LineItemImage
                        src={item.imageUrl}
                        alt={item.productTitle}
                      />
                    </TableCell>
                    <TableCell className="max-w-md text-base font-medium">
                      {item.displayName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-sm">
                        {item.sku}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {item.unitsSoldDisplay}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <span className="font-semibold tabular-nums text-destructive">
                        {item.available}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!loading && !error && items.length > 0 ? (
          <p className="border-t border-border/50 px-6 py-3 text-sm text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} out of stock in Shopify
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
