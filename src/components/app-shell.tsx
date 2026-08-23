import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  Braces,
  Cat,
  ChevronDown,
  Database,
  Globe2,
  LayoutDashboard,
  Menu,
  Rocket,
  ServerCog,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Suspense, useState, type ComponentType } from "react";

import { useConsole } from "@/console-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const primaryNavigation = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/services", label: "Services", icon: ServerCog },
  { to: "/imports", label: "Curated imports", icon: Sparkles },
  { to: "/awesome", label: "Awesome sources", icon: Database },
  { to: "/activity", label: "Jobs & activity", icon: Activity },
] as const;

const toolNavigation = [
  { to: "/explorer", label: "API explorer", icon: Braces },
  { to: "/settings/profiles", label: "Profiles", icon: Settings2 },
  { to: "/settings/agent", label: "Agent", icon: Bot },
  { to: "/settings/fly", label: "Fly.io", icon: Rocket },
] as const;

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { environment, setEnvironment } = useConsole();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const isProduction = environment === "production";

  return (
    <div
      className={cn(
        "min-h-screen bg-background",
        isProduction && "environment-production",
      )}
    >
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 border-r bg-sidebar lg:flex lg:flex-col">
          <Sidebar path={path} onNavigate={() => undefined} />
        </aside>

        <div className="min-w-0 flex-1">
          <header
            className={cn(
              "sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-6",
              isProduction && "border-t-2 border-t-amber-500",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Open navigation"
                  >
                    <Menu />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <Sidebar
                    path={path}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </SheetContent>
              </Sheet>
              <div className="hidden text-sm text-muted-foreground sm:block">
                Starcat operations
              </div>
              <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
            </div>

            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
                      isProduction
                        ? "border-amber-300 bg-amber-50 text-amber-950"
                        : "border-emerald-200 bg-emerald-50 text-emerald-950",
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        isProduction ? "bg-amber-500" : "bg-emerald-500",
                      )}
                    />
                    <span className="hidden text-xs font-semibold uppercase tracking-[0.12em] sm:inline">
                      {isProduction ? "Production" : "Test"}
                    </span>
                    <Switch
                      aria-label="Switch environment"
                      checked={isProduction}
                      onCheckedChange={(checked) =>
                        setEnvironment(checked ? "production" : "test")
                      }
                      className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-emerald-600"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  所有统计和操作将立即切换到该环境
                </TooltipContent>
              </Tooltip>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="hidden sm:inline-flex"
              >
                <Link to="/settings/profiles">
                  <Settings2 /> Configure
                </Link>
              </Button>
            </div>
          </header>

          {isProduction && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950">
              Production environment ·
              写操作会直接影响线上数据，请核对动作与目标服务。
            </div>
          )}
          <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-4 w-[min(38rem,90%)] animate-pulse rounded bg-muted" />
      <div className="mt-10 h-72 animate-pulse rounded-lg border bg-card" />
    </div>
  );
}

function Sidebar({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="grid size-9 place-items-center rounded-lg bg-foreground text-background shadow-sm">
          <Cat className="size-5" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">
            Starcat Admin
          </div>
          <div className="text-[11px] text-muted-foreground">
            Local operations console
          </div>
        </div>
      </div>
      <Separator />
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <NavGroup
          label="Workspace"
          items={primaryNavigation}
          path={path}
          onNavigate={onNavigate}
        />
        <NavGroup
          label="Tools & settings"
          items={toolNavigation}
          path={path}
          onNavigate={onNavigate}
        />
      </nav>
      <div className="border-t p-4">
        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">Local BFF</span>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              127.0.0.1
            </Badge>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            密钥只保存在本机服务端，不下发浏览器。
          </p>
        </div>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  items,
  path,
  onNavigate,
}: {
  label: string;
  items: readonly {
    to: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }[];
  path: string;
  onNavigate: () => void;
}) {
  return (
    <div>
      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="space-y-1">
        {items.map((item) => {
          const active =
            item.to === "/" ? path === "/" : path.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active &&
                  "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        {eyebrow && (
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function EnvironmentMark() {
  const { environment } = useConsole();
  const production = environment === "production";
  return (
    <Badge
      className={cn(
        "border font-semibold uppercase tracking-wider",
        production
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
      variant="outline"
    >
      <Globe2 className="size-3" /> {environment}
    </Badge>
  );
}
