import { Suspense } from "react";

import { CustomerSearchFilter } from "@/components/filters/customer-search-filter";
import { Skeleton } from "@/components/ui/skeleton";

export function CustomerSearchFilterBar({ className }: { className?: string }) {
  return (
    <Suspense
      fallback={<Skeleton className="h-9 w-full max-w-md rounded-lg" />}
    >
      <CustomerSearchFilter className={className} />
    </Suspense>
  );
}
