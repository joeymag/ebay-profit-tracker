"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CustomerFilterProps = {
  className?: string;
};

export function CustomerFilter({ className }: CustomerFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCustomer = searchParams.get("customer") ?? "";

  function applyCustomer(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (!value.trim()) {
      params.delete("customer");
    } else {
      params.set("customer", value.trim());
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
    router.refresh();
  }

  return (
    <div className={cn("space-y-3", className)}>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const input = form.elements.namedItem("customer") as HTMLInputElement;
          applyCustomer(input.value);
        }}
      >
        <div className="relative min-w-[12rem] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="customer"
            type="search"
            placeholder="Search by customer name or eBay username…"
            defaultValue={activeCustomer}
            key={activeCustomer}
            className="pl-9"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Search
        </Button>
        {activeCustomer ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => applyCustomer("")}
          >
            <X className="size-4" />
            Clear
          </Button>
        ) : null}
      </form>
    </div>
  );
}
