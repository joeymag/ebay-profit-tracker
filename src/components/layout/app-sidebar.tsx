"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calculator,
  ClockAlert,
  LayoutDashboard,
  LineChart,
  Map,
  Package,
  ScanBarcode,
  Settings,
  ShoppingBag,
  Store,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

import { navGroups, navItems } from "@/config/site";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const iconMap = {
  "layout-dashboard": LayoutDashboard,
  "line-chart": LineChart,
  "shopping-bag": ShoppingBag,
  "clock-alert": ClockAlert,
  users: Users,
  trophy: Trophy,
  calculator: Calculator,
  store: Store,
  map: Map,
  package: Package,
  "scan-barcode": ScanBarcode,
  settings: Settings,
} as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/80">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
                <TrendingUp className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-base leading-tight">
                <span className="truncate font-bold tracking-tight">
                  Profit Tracker
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  tstrade · Shopify
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto overscroll-contain">
        {navGroups.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel className="text-xs font-semibold tracking-wider uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems
                  .filter((item) => item.group === group.key)
                  .map((item) => {
                    const Icon = iconMap[item.icon];
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          render={<Link href={item.href} />}
                          isActive={isActive}
                          tooltip={item.title}
                          className="rounded-lg text-base data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold"
                        >
                          <Icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60">
        <p className="px-2 text-xs leading-relaxed text-muted-foreground group-data-[collapsible=icon]:hidden">
          eBay orders via Shopify · standalone app
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
