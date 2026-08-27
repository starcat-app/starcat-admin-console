/** 显式路由树便于独立部署时保持 SPA fallback 与类型安全导航。 */
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { lazy } from "react";

import { AppShell } from "@/components/app-shell";
import { serviceIds, type ServiceId } from "@/types";

const OverviewPage = lazy(() =>
  import("@/pages/overview").then((module) => ({
    default: module.OverviewPage,
  })),
);
const ServicesPage = lazy(() =>
  import("@/pages/services").then((module) => ({
    default: module.ServicesPage,
  })),
);
const MonitoringPage = lazy(() =>
  import("@/pages/monitoring").then((module) => ({
    default: module.MonitoringPage,
  })),
);
const ImportsPage = lazy(() =>
  import("@/pages/imports").then((module) => ({ default: module.ImportsPage })),
);
const AwesomePage = lazy(() =>
  import("@/pages/awesome").then((module) => ({ default: module.AwesomePage })),
);
const ActivityPage = lazy(() =>
  import("@/pages/activity").then((module) => ({
    default: module.ActivityPage,
  })),
);
const DataPlatformPage = lazy(() =>
  import("@/pages/data-platform").then((module) => ({
    default: module.DataPlatformPage,
  })),
);
const DataPlatformDatasetsPage = lazy(() =>
  import("@/pages/data-platform-datasets").then((module) => ({
    default: module.DataPlatformDatasetsPage,
  })),
);
const DataPlatformPartitionsPage = lazy(() =>
  import("@/pages/data-platform-partitions").then((module) => ({
    default: module.DataPlatformPartitionsPage,
  })),
);
const DataPlatformStoragePage = lazy(() =>
  import("@/pages/data-platform-storage").then((module) => ({
    default: module.DataPlatformStoragePage,
  })),
);
const ExplorerPage = lazy(() =>
  import("@/pages/explorer").then((module) => ({
    default: module.ExplorerPage,
  })),
);
const ProfilesPage = lazy(() =>
  import("@/pages/settings").then((module) => ({
    default: module.ProfilesPage,
  })),
);
const AgentSettingsPage = lazy(() =>
  import("@/pages/settings").then((module) => ({
    default: module.AgentSettingsPage,
  })),
);
const FlySettingsPage = lazy(() =>
  import("@/pages/fly").then((module) => ({ default: module.FlySettingsPage })),
);

const rootRoute = createRootRoute({ component: AppShell });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});
const servicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/services",
  validateSearch: (
    search: Record<string, unknown>,
  ): { service?: ServiceId } => ({
    service:
      typeof search.service === "string" &&
      (serviceIds as readonly string[]).includes(search.service)
        ? (search.service as ServiceId)
        : undefined,
  }),
  component: ServicesPage,
});
const monitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/monitoring",
  component: MonitoringPage,
});
const importsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/imports",
  component: ImportsPage,
});
const awesomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/awesome",
  component: AwesomePage,
});
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activity",
  component: ActivityPage,
});
const dataPlatformRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/data-platform",
  component: DataPlatformPage,
});
const dataPlatformDatasetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/data-platform/datasets",
  component: DataPlatformDatasetsPage,
});
const dataPlatformPartitionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/data-platform/partitions",
  component: DataPlatformPartitionsPage,
});
const dataPlatformStorageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/data-platform/storage",
  component: DataPlatformStoragePage,
});
const explorerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/explorer",
  component: ExplorerPage,
});
const profilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/profiles",
  component: ProfilesPage,
});
const agentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/agent",
  component: AgentSettingsPage,
});
const flyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/fly",
  component: FlySettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  servicesRoute,
  monitoringRoute,
  importsRoute,
  awesomeRoute,
  activityRoute,
  dataPlatformRoute,
  dataPlatformDatasetsRoute,
  dataPlatformPartitionsRoute,
  dataPlatformStorageRoute,
  explorerRoute,
  profilesRoute,
  agentRoute,
  flyRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
