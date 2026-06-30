"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  CHANNEL_FILTER_OPTIONS,
  channelStyles,
  parseSalesChannelFilter,
} from "@/lib/orders/channel";
import { cn } from "@/lib/utils";

type ChannelFilterProps = {
  className?: string;
};

export function ChannelFilter({ className }: ChannelFilterProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = parseSalesChannelFilter(searchParams.get("channel"));

  function hrefForChannel(channel: (typeof CHANNEL_FILTER_OPTIONS)[number]["key"]) {
    const params = new URLSearchParams(searchParams.toString());
    const option = CHANNEL_FILTER_OPTIONS.find((item) => item.key === channel);

    if (!option?.param) {
      params.delete("channel");
    } else {
      params.set("channel", option.param);
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {CHANNEL_FILTER_OPTIONS.map((option) => {
        const isActive = active === option.key;
        const style =
          option.key !== "all" ? channelStyles[option.key] : null;

        return (
          <Link
            key={option.key}
            href={hrefForChannel(option.key)}
            scroll={false}
            className={cn(
              buttonVariants({
                variant: isActive ? "default" : "outline",
                size: "sm",
              }),
              !isActive &&
                style &&
                "border-transparent bg-transparent hover:bg-muted/60",
              !isActive && style && style.badge,
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
