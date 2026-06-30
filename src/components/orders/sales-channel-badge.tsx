import { Badge } from "@/components/ui/badge";
import {
  channelStyles,
  getSalesChannel,
  type SalesChannel,
} from "@/lib/orders/channel";
import { cn } from "@/lib/utils";

type SalesChannelBadgeProps = {
  tags: string | null | undefined;
  channel?: SalesChannel;
  className?: string;
};

export function SalesChannelBadge({
  tags,
  channel,
  className,
}: SalesChannelBadgeProps) {
  const resolved = channel ?? getSalesChannel(tags);

  if (!tags?.trim() && resolved === "Other") {
    return <span className="text-muted-foreground">—</span>;
  }

  const style = channelStyles[resolved];

  return (
    <Badge variant="outline" className={cn("px-2.5 py-0.5 text-sm", style.badge, className)}>
      {style.label}
    </Badge>
  );
}
