"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  DATE_RANGE_OPTIONS,
  parseDateRange,
  type DateRangeKey,
} from "@/lib/date-range";
import { cn } from "@/lib/utils";

type DateRangeFilterProps = {
  className?: string;
};

export function DateRangeFilter({ className }: DateRangeFilterProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = parseDateRange(searchParams.get("range") ?? undefined);

  function hrefForRange(range: DateRangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (range === "30days") {
      params.delete("range");
    } else {
      params.set("range", range);
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {DATE_RANGE_OPTIONS.filter((option) => option.key !== "all").map(
        (option) => (
          <Link
            key={option.key}
            href={hrefForRange(option.key)}
            scroll={false}
            className={buttonVariants({
              variant: active === option.key ? "default" : "outline",
              size: "sm",
            })}
          >
            {option.label}
          </Link>
        ),
      )}
      <Link
        href={hrefForRange("all")}
        scroll={false}
        className={buttonVariants({
          variant: active === "all" ? "default" : "outline",
          size: "sm",
        })}
      >
        All time
      </Link>
    </div>
  );
}
