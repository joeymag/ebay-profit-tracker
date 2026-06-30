"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EPOXY_BLACK_12_INCH_VARIANT } from "@/lib/orders/product-filter";
import { cn } from "@/lib/utils";

type ProductFilterProps = {
  className?: string;
};

export function ProductFilter({ className }: ProductFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeProduct = searchParams.get("product") ?? "";

  function applyProduct(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (!value.trim()) {
      params.delete("product");
    } else {
      params.set("product", value.trim());
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
    router.refresh();
  }

  function clearProduct() {
    applyProduct("");
  }

  const presetHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("product", EPOXY_BLACK_12_INCH_VARIANT);
    if (!params.get("range")) {
      params.set("range", "all");
    }
    return `${pathname}?${params.toString()}`;
  })();

  const isPresetActive =
    activeProduct.toLowerCase() === EPOXY_BLACK_12_INCH_VARIANT.toLowerCase();

  return (
    <div className={cn("space-y-3", className)}>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const input = form.elements.namedItem("product") as HTMLInputElement;
          applyProduct(input.value);
        }}
      >
        <div className="relative min-w-[12rem] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="product"
            type="search"
            placeholder="Filter by product title…"
            defaultValue={activeProduct}
            key={activeProduct}
            className="pl-9"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Search
        </Button>
        {activeProduct ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={clearProduct}
          >
            <X className="size-4" />
            Clear
          </Button>
        ) : null}
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Quick filter:</span>
        {isPresetActive ? (
          <Button type="button" size="sm" variant="default" disabled>
            {EPOXY_BLACK_12_INCH_VARIANT}
          </Button>
        ) : (
          <Link
            href={presetHref}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {EPOXY_BLACK_12_INCH_VARIANT}
          </Link>
        )}
      </div>
    </div>
  );
}
