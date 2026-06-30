import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

type LineItemImageProps = {
  src: string | null | undefined;
  alt: string;
  className?: string;
};

export function LineItemImage({ src, alt, className }: LineItemImageProps) {
  if (!src) {
    return (
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        <Package className="size-5" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external Shopify CDN URLs
    <img
      src={src}
      alt={alt}
      className={cn(
        "size-12 shrink-0 rounded-lg border border-border/60 bg-muted/20 object-cover",
        className,
      )}
      loading="lazy"
    />
  );
}
