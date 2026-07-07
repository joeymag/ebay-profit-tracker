"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { ShopifyEmbedNotice } from "@/components/shopify/shopify-embed-notice";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="dashboard-canvas min-h-svh bg-background">
          <ShopifyEmbedNotice />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
