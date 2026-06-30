import { Suspense } from "react";

import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { Skeleton } from "@/components/ui/skeleton";

export function DateRangeFilterBar({ className }: { className?: string }) {
  return (
    <Suspense
      fallback={<Skeleton className="h-9 w-full max-w-xl rounded-lg" />}
    >
      <DateRangeFilter className={className} />
    </Suspense>
  );
}
