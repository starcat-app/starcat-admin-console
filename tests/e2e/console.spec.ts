import { expect, test } from "@playwright/test";

const services = [
  "sharing",
  "trending",
  "weekly",
  "wiki",
  "recommend",
  "discovery",
  "license",
].map((id, index) => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
  description: `${id} test fixture`,
  readOnly: id === "license",
  online: index !== 3,
  authenticated: index < 5,
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
  credentials: {
    apiKey: { configured: index < 5 },
    adminKey: { configured: index < 3 },
  },
}));

test.beforeEach(async ({ page }) => {
  await page.route("**/api/services?environment=*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: services }),
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
  await expect(page.getByText("6 / 7")).toBeVisible();
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
