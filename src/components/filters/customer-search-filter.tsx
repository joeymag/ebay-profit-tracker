"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CustomerSearchFilterProps = {
  className?: string;
};

export function CustomerSearchFilter({ className }: CustomerSearchFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeQuery = searchParams.get("q") ?? "";

  function applyQuery(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (!value.trim()) {
      params.delete("q");
    } else {
      params.set("q", value.trim());
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
    router.refresh();
  }

  return (
    <form
      className={cn("flex flex-wrap items-center gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const input = form.elements.namedItem("q") as HTMLInputElement;
        applyQuery(input.value);
      }}
    >
      <div className="relative min-w-[12rem] flex-1 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          type="search"
          placeholder="Search name, eBay username, or order #…"
          defaultValue={activeQuery}
          key={activeQuery}
          className="pl-9"
        />
      </div>
      <Button type="submit" size="sm" variant="secondary">
        Search
      </Button>
      {activeQuery ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5"
          onClick={() => applyQuery("")}
        >
          <X className="size-4" />
          Clear
        </Button>
      ) : null}
    </form>
  );
}
