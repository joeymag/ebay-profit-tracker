export const siteConfig = {
  name: "Store Profit Tracker",
  description: "Track revenue, costs, and profit from your Shopify store.",
} as const;

export const navItems = [
  { title: "Dashboard", href: "/", icon: "layout-dashboard" as const, group: "main" as const },
  { title: "Daily sales", href: "/daily-sales", icon: "line-chart" as const, group: "main" as const },
  { title: "Orders", href: "/orders", icon: "shopping-bag" as const, group: "main" as const },
  { title: "Late deliveries", href: "/late-deliveries", icon: "clock-alert" as const, group: "main" as const },
  { title: "Customers", href: "/customers", icon: "users" as const, group: "main" as const },
  { title: "Top products", href: "/top-products", icon: "trophy" as const, group: "main" as const },
  { title: "Map", href: "/map", icon: "map" as const, group: "main" as const },
  { title: "Products", href: "/products", icon: "package" as const, group: "main" as const },
  { title: "Stock control", href: "/stock", icon: "scan-barcode" as const, group: "main" as const },
  { title: "eBay calculator", href: "/ebay-calculator", icon: "calculator" as const, group: "tools" as const },
  { title: "Amazon calculator", href: "/amazon-calculator", icon: "store" as const, group: "tools" as const },
  { title: "Settings", href: "/settings", icon: "settings" as const, group: "tools" as const },
] as const;

export const navGroups = [
  { key: "main" as const, label: "Menu" },
  { key: "tools" as const, label: "Tools" },
] as const;
