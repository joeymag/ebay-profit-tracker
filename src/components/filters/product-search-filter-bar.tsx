import { Suspense } from "react";

import { ProductSearchFilter } from "@/components/filters/product-search-filter";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductSearchFilterBar({ className }: { className?: string }) {
  return (
    <Suspense
      fallback={<Skeleton className="h-9 w-full max-w-md rounded-lg" />}
    >
      <ProductSearchFilter className={className} />
    </Suspense>
  );
}
