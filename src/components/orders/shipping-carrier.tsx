import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ShippingCarrierProps = {
  carrier: string | null | undefined;
  service: string | null | undefined;
  className?: string;
};

function serviceDiffersFromCarrier(
  carrier: string | null | undefined,
  service: string | null | undefined,
): boolean {
  if (!carrier || !service) {
    return false;
  }
  return !service.toLowerCase().includes(carrier.toLowerCase());
}

export function ShippingCarrier({
  carrier,
  service,
  className,
}: ShippingCarrierProps) {
  if (!carrier && !service) {
    return <span className="text-muted-foreground">—</span>;
  }

  const showOrderedAs = serviceDiffersFromCarrier(carrier, service);

  return (
    <div className={cn("max-w-[10rem] space-y-1", className)}>
      {carrier ? (
        <Badge variant="outline" className="px-2.5 py-1 text-sm font-medium">
          {carrier}
        </Badge>
      ) : service ? (
        <Badge variant="secondary" className="px-2.5 py-1 text-sm font-medium">
          {service}
        </Badge>
      ) : null}
      {showOrderedAs ? (
        <p className="text-xs leading-snug text-muted-foreground">
          eBay: {service}
        </p>
      ) : null}
    </div>
  );
}
