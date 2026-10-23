"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { CompetitorPricesPanel } from "@/components/ebay-listings/competitor-prices-panel";
import { ListingVariationsPanel } from "@/components/ebay-listings/listing-variations-panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ListingDetailTabsProps = {
  listingId: string;
};

type TabId = "variations" | "competitors";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "variations", label: "Variations" },
  { id: "competitors", label: "Competitor prices" },
];

export function ListingDetailTabs({ listingId }: ListingDetailTabsProps) {
  const [tab, setTab] = useState<TabId>("variations");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/ebay-listings"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowLeft className="size-4" />
          All listings
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="Listing sections"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {TABS.map((entry) => {
          const selected = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`listing-tab-${entry.id}`}
              onClick={() => setTab(entry.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                selected
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`listing-tab-${tab}`}
        className="min-w-0"
      >
        {tab === "variations" ? (
          <ListingVariationsPanel listingId={listingId} hideBackLink />
        ) : (
          <CompetitorPricesPanel listingId={listingId} />
        )}
      </div>
    </div>
  );
}
