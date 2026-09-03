"use client";

import Link from "next/link";
import { Printer } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PrintBagLabelButton({ sku }: { sku: string }) {
  return (
    <Link
      href={`/product-labels?sku=${encodeURIComponent(sku)}`}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
    >
      <Printer className="size-4" />
      Label
    </Link>
  );
}
