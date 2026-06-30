import Link from "next/link";

export function MapEmptyHint({ markerCount }: { markerCount: number }) {
  if (markerCount > 0) {
    return null;
  }

  return (
    <p className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-3 text-base text-muted-foreground">
      No geocoded orders in this period. Sync orders from Shopify to import
      addresses, then run geocoding. Orders with a postcode are mapped
      automatically after sync.
    </p>
  );
}

export function MapStatsBar({
  markerCount,
  totalOrders,
  missingGeocode,
  rangeLabel,
}: {
  markerCount: number;
  totalOrders: number;
  missingGeocode: number;
  rangeLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-muted-foreground">
      <span>
        <strong className="text-foreground">{markerCount}</strong> on map ·{" "}
        {rangeLabel.toLowerCase()}
      </span>
      <span>
        {totalOrders} orders in filter
        {missingGeocode > 0 ? (
          <>
            {" "}
            ·{" "}
            <strong className="text-foreground">{missingGeocode}</strong> with
            address but not geocoded yet
          </>
        ) : null}
      </span>
    </div>
  );
}

export function MapAttributionNote() {
  return (
    <p className="text-sm text-muted-foreground">
      Map data &copy;{" "}
      <Link
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        OpenStreetMap
      </Link>{" "}
      contributors · UK postcodes via postcodes.io
    </p>
  );
}
