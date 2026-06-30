"use client";

import { SidebarTriggerSafe } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/mode-toggle";

type DashboardHeaderProps = {
  title: string;
  description?: string;
};

export function DashboardHeader({ title, description }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-[4.25rem] shrink-0 items-center gap-4 border-b border-border/70 bg-background/80 px-5 backdrop-blur-xl md:px-8">
      <SidebarTriggerSafe className="-ml-1 size-9 text-muted-foreground hover:text-foreground" />
      <Separator orientation="vertical" className="mr-1 h-6" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="truncate text-base text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <ModeToggle />
    </header>
  );
}
