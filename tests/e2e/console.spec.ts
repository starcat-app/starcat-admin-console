import { expect, test } from "@playwright/test";

const services = [
  "sharing",
  "trending",
  "weekly",
  "wiki",
  "recommend",
  "discovery",
].map((id, index) => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
  description: `${id} test fixture`,
  readOnly: false,
  online: index !== 3,
  authenticated: true,
  latencyMs: 18 + index,
  stats:
    index < 4
      ? [
          {
            id: "total",
            label: "Total",
            value: 1200 + index,
            description: "Fixture",
          },
        ]
      : [],
  actions: [],
  credentialKinds:
    id === "weekly" || id === "discovery" ? ["apiKey", "adminKey"] : ["apiKey"],
  credentials: {
    apiKey: { configured: true },
    adminKey: { configured: id === "weekly" || id === "discovery" },
  },
}));

const serviceConnections = Object.fromEntries(
  services.map((service, index) => [
    service.id,
    { baseURL: `http://127.0.0.1:${5001 + index}` },
  ]),
);

const secretProfile = Object.fromEntries(
  services.map((service) => [service.id, service.credentials]),
);

const config = {
  profiles: {
    test: { gatewayURL: "", services: serviceConnections },
    production: {
      gatewayURL: "https://starcat-api.fly.dev",
      services: Object.fromEntries(
        services.map((service) => [
          service.id,
          { baseURL: "https://starcat-api.fly.dev" },
        ]),
      ),
    },
  },
  agent: { runtime: "codex", baseURL: "", model: "" },
  fly: { apiBaseURL: "", apps: {} },
  secrets: {
    profiles: { test: secretProfile, production: secretProfile },
    productionSharedApiKey: { configured: true, fingerprint: "1234ABCD" },
    agentApiKey: { configured: false },
    githubToken: { configured: false },
    flyToken: { configured: false },
  },
  dataDirectory: "/tmp/starcat-admin-e2e",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/services?environment=*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: services }),
    }),
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: config }),
    }),
  );
  await page.route("**/api/config/agent/runtimes", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            runtime: "codex",
            available: true,
            command: "/opt/homebrew/bin/codex",
            version: "codex-cli test",
          },
          {
            runtime: "claude",
            available: true,
            command: "/opt/homebrew/bin/claude",
            version: "Claude Code test",
          },
        ],
      }),
    }),
  );
});

test("switches environment and navigates the console shell", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "System overview" }),
  ).toBeVisible();
  await expect(page.getByText("5 / 6")).toBeVisible();
  await page.getByRole("switch", { name: "Switch environment" }).click();
  await expect(
    page.getByText("Production environment", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Curated imports" }).click();
  await expect(
    page.getByRole("heading", { name: "Curated imports" }),
  ).toBeVisible();
  await expect(page.getByText("Agent-assisted workflow")).toBeVisible();
});

test("opens navigation on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "System overview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Awesome sources" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Awesome sources" }),
  ).toBeVisible();
});

test("switches to dark theme and keeps the preference after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Theme: System" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("starcat-admin-theme")),
    )
    .toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();
});

test("shows only credentials supported by the selected environment", async ({
  page,
}) => {
  await page.goto("/settings/profiles");
  await expect(
    page.getByRole("heading", { name: "Environment profiles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "API", exact: true }),
  ).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Admin", exact: true }),
  ).toHaveCount(2);

  await page.getByRole("switch", { name: "Switch environment" }).click();
  await expect(
    page.getByRole("button", { name: "Shared API", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "API", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Admin", exact: true }),
  ).toHaveCount(2);
});

test("uses a detected local Agent without provider credentials", async ({
  page,
}) => {
  await page.route("**/api/config/agent/test", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { runtime: "codex", ok: true } }),
    }),
  );
  await page.goto("/settings/agent");

  await expect(
    page.getByRole("heading", { name: "Agent & verification" }),
  ).toBeVisible();
  await expect(page.getByText("/opt/homebrew/bin/codex")).toBeVisible();
  await expect(page.getByText("codex-cli test")).toBeVisible();
  await expect(page.getByText("Agent API key")).toHaveCount(0);
  await expect(page.getByText("GitHub token", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "测试 Agent" }).click();
  await expect(page.getByText("Codex CLI 连接正常")).toBeVisible();
});
