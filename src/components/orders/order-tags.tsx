import { Badge } from "@/components/ui/badge";
import { SalesChannelBadge } from "@/components/orders/sales-channel-badge";
import { getSalesChannel } from "@/lib/orders/channel";

type OrderTagsProps = {
  tags: string | null | undefined;
};

export function OrderTags({ tags }: OrderTagsProps) {
  if (!tags?.trim()) {
    return <span className="text-muted-foreground">—</span>;
  }

  const channel = getSalesChannel(tags);
  const parts = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const extraTags = parts.filter((tag) => {
    const lower = tag.toLowerCase();
    if (channel === "Amazon" && lower.includes("amazon")) {
      return false;
    }
    if (channel === "eBay" && lower.includes("ebay")) {
      return false;
    }
    if (channel === "Temu" && lower.includes("temu")) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex max-w-[12rem] flex-col gap-1.5">
      <SalesChannelBadge tags={tags} channel={channel} />
      {extraTags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {extraTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
