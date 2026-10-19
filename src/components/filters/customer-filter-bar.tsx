import { Suspense } from "react";

import { CustomerFilter } from "@/components/filters/customer-filter";
import { Skeleton } from "@/components/ui/skeleton";

export function CustomerFilterBar({ className }: { className?: string }) {
  return (
    <Suspense
      fallback={<Skeleton className="h-10 w-full max-w-xl rounded-lg" />}
    >
      <CustomerFilter className={className} />
    </Suspense>
  );
}
