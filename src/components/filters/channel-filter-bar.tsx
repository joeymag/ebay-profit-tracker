import { Suspense } from "react";

import { ChannelFilter } from "@/components/filters/channel-filter";
import { Skeleton } from "@/components/ui/skeleton";

export function ChannelFilterBar({ className }: { className?: string }) {
  return (
    <Suspense
      fallback={<Skeleton className="h-9 w-full max-w-xl rounded-lg" />}
    >
      <ChannelFilter className={className} />
    </Suspense>
  );
}
