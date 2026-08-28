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
  resources: [],
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
  await page.route("**/api/services/observability?environment=*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: services.map((service, index) => ({
          id: service.id,
          label: service.label,
          ok: true,
          summary: {
            service: service.id,
            request_count: 100 + index,
            error_count: index,
            error_rate: index / (100 + index),
            average_ms: 12 + index,
            p95_ms: 25 + index,
            p99_ms: 50 + index,
            response_bytes: 2048,
          },
          timeseries: {
            service: service.id,
            metric: "requests",
            interval: "5m0s",
            points: [
              { timestamp: "2026-08-27T00:00:00Z", value: 40 + index },
              { timestamp: "2026-08-27T00:05:00Z", value: 60 + index },
            ],
          },
          routes: [
            {
              method: "GET",
              route: "/api/v1/ping",
              request_count: 100 + index,
              error_count: index,
              error_rate: 0,
              average_ms: 4,
              p95_ms: 10,
              maximum_ms: 12,
            },
          ],
          statusCodes: [{ status_class: "2xx", request_count: 100 }],
        })),
      }),
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
  await page.route("**/api/imports/sources?environment=*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            code: "ai_intelligence",
            display_name_zh: "AI 情报",
            display_name_en: "AI Intelligence",
            icon_key: "sparkles",
            sort_order: 50,
            count: 12,
            ingest_mode: "manual_import",
            enabled: true,
            manual_import_enabled: true,
          },
        ],
      }),
    }),
  );
  await page.route("**/api/awesome/sources?environment=*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "awesome-mac",
            repo_full_name: "jaywcjlove/awesome-mac",
            display_name: "awesome-mac",
            image_url: "",
            summary_zh: "",
            summary_en: "",
            featured: false,
            sort_order: 1,
            status: "published",
            github_repo_count: 289,
            external_entry_count: 0,
            resource_entry_count: 0,
            last_synced_at: "2026-08-27T00:00:00Z",
          },
          {
            id: "awesome-empty",
            repo_full_name: "starcat-app/awesome-empty",
            display_name: "awesome-empty",
            image_url: "",
            summary_zh: "",
            summary_en: "",
            featured: false,
            sort_order: 2,
            status: "ready",
            github_repo_count: 0,
            external_entry_count: 820,
            resource_entry_count: 0,
            last_synced_at: "2026-08-27T00:00:00Z",
          },
          {
            id: "awesome-pending",
            repo_full_name: "starcat-app/awesome-pending",
            display_name: "awesome-pending",
            image_url: "",
            summary_zh: "",
            summary_en: "",
            featured: false,
            sort_order: 3,
            status: "draft",
            github_repo_count: 0,
          },
          {
            id: "awesome-archived",
            repo_full_name: "starcat-app/awesome-archived",
            display_name: "awesome-archived",
            image_url: "",
            summary_zh: "",
            summary_en: "",
            featured: false,
            sort_order: 4,
            status: "archived",
            github_repo_count: 12,
            last_synced_at: "2026-08-27T00:00:00Z",
          },
          {
            id: "awesome-python",
            repo_full_name: "vinta/awesome-python",
            display_name: "awesome-python",
            image_url: "",
            summary_zh: "",
            summary_en: "",
            featured: false,
            sort_order: 5,
            status: "published",
            github_repo_count: 475,
            last_synced_at: "2026-08-27T00:00:00Z",
          },
          {
            id: "awesome-go",
            repo_full_name: "avelino/awesome-go",
            display_name: "awesome-go",
            image_url: "",
            summary_zh: "",
            summary_en: "",
            featured: false,
            sort_order: 6,
            status: "published",
            github_repo_count: 2799,
            last_synced_at: "2026-08-27T00:00:00Z",
          },
        ],
      }),
    }),
  );
});

test("shows parsed entry counts for Awesome sources", async ({ page }) => {
  await page.goto("/awesome");

  await expect(
    page.getByRole("columnheader", { name: "Projects" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /awesome-mac/ }).getByText("289 entries"),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /awesome-empty/ }).getByText("820 entries"),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /awesome-empty/ }).getByText("820 external"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row", { name: /awesome-pending/ })
      .getByRole("cell")
      .nth(3),
  ).toHaveText("—");
});

test("syncs every non-archived Awesome source with one action", async ({
  page,
}) => {
  const requests: string[] = [];
  let releaseRequests!: () => void;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequests = resolve;
  });
  await page.route(
    "**/api/awesome/sources/*/sync?environment=*",
    async (route) => {
      requests.push(route.request().url());
      await requestGate;
      const failed = route.request().url().includes("awesome-empty");
      await route.fulfill({
        status: failed ? 500 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          failed
            ? { error: "fixture sync failed" }
            : { data: { status: "succeeded" } },
        ),
      });
    },
  );

  await page.goto("/awesome");
  const syncAll = page.getByRole("button", { name: "Sync all" });
  await syncAll.click();

  await expect.poll(() => requests.length).toBe(3);
  await expect(
    page.getByRole("button", { name: "Syncing 0 / 5" }),
  ).toBeDisabled();
  expect(requests.some((url) => url.includes("awesome-archived"))).toBe(false);

  releaseRequests();
  await expect.poll(() => requests.length).toBe(5);
  await expect(page.getByRole("button", { name: "Sync all" })).toBeEnabled();
  await expect(
    page.getByText("Awesome 同步完成：成功 4 个，失败 1 个"),
  ).toBeVisible();
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

test("shows API monitoring curves and route rankings", async ({ page }) => {
  await page.goto("/monitoring");
  await expect(
    page.getByRole("heading", { name: "API Monitoring" }),
  ).toBeVisible();
  await expect(page.getByText("Traffic timeseries")).toBeVisible();
  await expect(page.getByText("Route ranking")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "/api/v1/ping" }).first(),
  ).toBeVisible();
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Recommend" }).click();
  await expect(page.getByRole("cell", { name: "Recommend" })).toBeVisible();
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

test("selects and creates a Weekly import category before publishing", async ({
  page,
}) => {
  // 高窗口也必须保持紧凑，防止工作区跟随 viewport 无限拉长。
  await page.setViewportSize({ width: 1800, height: 1400 });
  const sources = [
    {
      code: "ai_intelligence",
      display_name_zh: "AI 情报",
      display_name_en: "AI Intelligence",
      icon_key: "sparkles",
      sort_order: 50,
      count: 12,
      ingest_mode: "manual_import",
      enabled: true,
      manual_import_enabled: true,
    },
  ];
  await page.route("**/api/imports/sources?environment=*", async (route) => {
    if (route.request().method() === "POST") {
      const created = {
        ...sources[0],
        ...(route.request().postDataJSON() as object),
        count: 0,
      };
      sources.push(created);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: created }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: sources }),
    });
  });
  await page.route("**/api/imports/identify", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          identificationID: "fixture-identification",
          findings: [
            {
              id: "finding-0",
              original: "OpenAI Codex",
              title: "Codex",
              status: "confirmed",
              confidence: 0.99,
              reason: "官方仓库",
              repository: "openai/codex",
              candidate: {
                fullName: "openai/codex",
                htmlURL: "https://github.com/openai/codex",
                description: "Codex CLI",
                stars: 100,
                language: "Rust",
                ownerAvatar: "https://example.com/openai.png",
                archived: false,
                readmeExcerpt: "Codex",
                matchedBy: "fixture",
              },
              candidates: [],
              selected: true,
            },
          ],
        },
      }),
    }),
  );

  await page.goto("/imports");
  const inputPanel = page.getByTestId("import-input-panel");
  const reviewPanel = page.getByTestId("import-review-panel");
  const emptyInputBox = await inputPanel.boundingBox();
  const emptyReviewBox = await reviewPanel.boundingBox();
  const actionBox = await page
    .getByRole("button", { name: "Identify & verify projects" })
    .boundingBox();
  expect(emptyInputBox?.height).toBe(880);
  expect(emptyInputBox?.height).toBe(emptyReviewBox?.height);
  const actionBottomInset = Math.round(
    emptyInputBox!.y +
      emptyInputBox!.height -
      (actionBox!.y + actionBox!.height),
  );
  expect(actionBottomInset).toBeGreaterThanOrEqual(20);
  expect(actionBottomInset).toBeLessThanOrEqual(21);

  await page.getByPlaceholder("示例：", { exact: false }).fill("OpenAI Codex");
  await page
    .getByRole("button", { name: "Identify & verify projects" })
    .click();
  await expect(page.getByText("将发布到：探索 → 周刊 → AI 情报")).toBeVisible();
  const selectBox = await page.getByLabel("发布到分类").boundingBox();
  const addCategoryBox = await page
    .getByRole("button", { name: "新增分类" })
    .boundingBox();
  const publishBox = await page
    .getByRole("button", { name: /Publish \d+ projects/ })
    .boundingBox();
  expect(selectBox).toBeTruthy();
  expect(addCategoryBox).toBeTruthy();
  expect(publishBox).toBeTruthy();
  // 三个操作控件必须顶对齐且同高；允许 1px 亚像素误差。
  expect(Math.abs(selectBox!.y - addCategoryBox!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(selectBox!.y - publishBox!.y)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(selectBox!.height - addCategoryBox!.height),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(selectBox!.height - publishBox!.height)).toBeLessThanOrEqual(
    1,
  );
  const resultInputBox = await inputPanel.boundingBox();
  const resultReviewBox = await reviewPanel.boundingBox();
  expect(resultInputBox?.height).toBe(emptyInputBox?.height);
  expect(resultReviewBox?.height).toBe(emptyReviewBox?.height);

  await page.getByRole("button", { name: "新增分类" }).click();
  await page.getByLabel("分类标识").fill("developer_tools");
  await page.getByLabel("中文名称").fill("开发工具");
  await page.getByLabel("英文名称").fill("Developer Tools");
  await page.getByRole("button", { name: "创建分类" }).click();

  await expect(
    page.getByText("将发布到：探索 → 周刊 → 开发工具"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "新增分类" })).toBeVisible();
});
