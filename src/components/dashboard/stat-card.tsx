import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent?: "default" | "revenue" | "cost" | "profit" | "orders";
};

const accentStyles = {
  default: {
    gradient: "from-primary/12 to-transparent",
    icon: "bg-primary/10 text-primary",
  },
  revenue: {
    gradient: "from-blue-500/12 to-transparent",
    icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  cost: {
    gradient: "from-amber-500/12 to-transparent",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  profit: {
    gradient: "from-violet-500/12 to-transparent",
    icon: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  orders: {
    gradient: "from-slate-500/10 to-transparent",
    icon: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "default",
}: StatCardProps) {
  const style = accentStyles[accent];

  return (
    <Card className="group surface-card relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90",
          style.gradient,
        )}
      />
      <CardHeader className="relative gap-3 pb-1">
        <div className="flex items-start justify-between gap-3">
          <CardDescription className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </CardDescription>
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-border/40",
              style.icon,
            )}
          >
            <Icon className="size-5" />
          </div>
        </div>
        <CardTitle className="text-4xl font-bold tracking-tight tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative pt-0">
        <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
