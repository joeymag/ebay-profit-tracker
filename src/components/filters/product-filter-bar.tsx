import { Suspense } from "react";

import { ProductFilter } from "@/components/filters/product-filter";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductFilterBar({ className }: { className?: string }) {
  return (
    <Suspense
      fallback={<Skeleton className="h-20 w-full max-w-xl rounded-lg" />}
    >
      <ProductFilter className={className} />
    </Suspense>
  );
}
