import { expect, test, type Route } from "@playwright/test";

const jobBase = {
  state: "succeeded",
  stage: "succeeded",
  inputHash: "sha256:fixture",
  createdAt: "2026-08-27T00:00:00.000Z",
  resultAvailable: true,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/data-platform/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/config")) {
      return fulfill(route, {
        available: true,
        billingProject: "starcat-e2e",
        location: "US",
        maximumBytesBilled: 10_737_418_240,
        maximumResultRows: 200,
        maximumResultBytes: 2_097_152,
      });
    }
    if (path.endsWith("/overview")) {
      return fulfill(route, {
        config: {
          billingProject: "starcat-e2e",
          location: "US",
          maximumBytesBilled: 10_737_418_240,
          maximumResultRows: 200,
          maximumResultBytes: 2_097_152,
        },
        downloads: [download("WatchEvent", 1946), download("PushEvent", 52)],
        jobs: [],
      });
    }
    if (path.includes("/datasets/githubarchive_watch_event/partitions")) {
      return fulfill(route, {
        items: [partitionFixture],
        total: 1,
        limit: 100,
        offset: 0,
      });
    }
    if (path.endsWith("/datasets")) {
      return fulfill(route, [datasetFixture]);
    }
    if (path.endsWith("/storage")) {
      return fulfill(route, [storageFixture]);
    }
    if (path.includes("/actions/lake.register-existing-watch-events/jobs")) {
      return fulfill(route, {
        ...jobBase,
        state: "queued",
        stage: "queued",
        jobId: "job-register-watch",
        actionId: "lake.register-existing-watch-events",
      });
    }
    if (path.endsWith("/bigquery/sql/dry-run")) {
      return fulfill(route, {
        ...jobBase,
        jobId: "job-dry-run",
        actionId: "bigquery.sql-lab.dry-run",
      });
    }
    if (path.endsWith("/bigquery/sql/query")) {
      return fulfill(route, {
        ...jobBase,
        jobId: "job-query",
        actionId: "bigquery.sql-lab.query",
      });
    }
    if (path.endsWith("/jobs/job-dry-run/result")) {
      return fulfill(route, {
        operation: "dry_run",
        sql_sha256: `sha256:${"a".repeat(64)}`,
        statement_type: "SELECT",
        estimated_bytes: 0,
        maximum_bytes_billed: 4_294_967_296,
        fields: [{ name: "ok", field_type: "INTEGER", mode: "NULLABLE" }],
        referenced_tables: [],
      });
    }
    if (path.endsWith("/jobs/job-query/result")) {
      return fulfill(route, {
        operation: "query",
        sql_sha256: `sha256:${"a".repeat(64)}`,
        job_id: "bq-job-e2e",
        estimated_bytes: 0,
        processed_bytes: 0,
        billed_bytes: 0,
        maximum_bytes_billed: 4_294_967_296,
        total_rows: 1,
        returned_rows: 1,
        truncated: false,
        fields: [{ name: "ok", field_type: "INTEGER", mode: "NULLABLE" }],
        rows: [{ ok: 1 }],
      });
    }
    if (path.includes("/jobs/job-")) {
      const dryRun = path.includes("job-dry-run");
      if (path.includes("job-register-watch")) {
        return fulfill(route, {
          ...jobBase,
          jobId: "job-register-watch",
          actionId: "lake.register-existing-watch-events",
        });
      }
      return fulfill(route, {
        ...jobBase,
        jobId: dryRun ? "job-dry-run" : "job-query",
        actionId: dryRun
          ? "bigquery.sql-lab.dry-run"
          : "bigquery.sql-lab.query",
      });
    }
    return route.fallback();
  });
});

test("registers and inspects the local Dataset Catalog without exposing paths", async ({
  page,
}) => {
  await page.goto("/data-platform/datasets");

  await expect(page.getByRole("heading", { name: "Datasets" })).toBeVisible();
  await expect(page.getByText(datasetFixture.logicalUri)).toBeVisible();
  await expect(page.getByText("/Volumes/T0", { exact: false })).toHaveCount(0);

  await page
    .getByRole("button", { name: "Inspect & register" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "确认登记既有 Raw Dataset" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm inspection" }).click();
  await expect(
    page.getByText("Raw Dataset 已完成只读检查并登记到 Catalog"),
  ).toBeVisible();

  await page.getByRole("link", { name: "Partitions" }).click();
  await expect(page.getByRole("heading", { name: "Partitions" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "2016-01-01", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(partitionFixture.logicalUri)).toBeVisible();

  await page.getByRole("link", { name: "Storage" }).click();
  await expect(page.getByRole("heading", { name: "Storage" })).toBeVisible();
  await expect(page.getByText("Primary data volume")).toBeVisible();
  await expect(page.getByText("storage://primary-data-volume")).toBeVisible();
});

test("runs the guarded SQL Lab flow in the isolated local data platform", async ({
  page,
}) => {
  await page.goto("/data-platform");

  await expect(
    page.getByRole("heading", { name: "BigQuery operations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("Local data platform"),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Switch environment" }),
  ).toHaveCount(0);
  await expect(page.getByText("1946 / 3890 partitions")).toBeVisible();
  await expect(page.getByText("52 / 3890 partitions")).toBeVisible();

  await page
    .getByRole("textbox", { name: "BigQuery SQL" })
    .fill("SELECT 1 AS ok");
  await page.getByRole("button", { name: "Dry run" }).click();
  await expect(page.getByText("Dry run passed")).toBeVisible();
  await page.getByRole("button", { name: "Execute" }).click();

  await expect(page.getByText("Query result")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "ok" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1" })).toBeVisible();
});

function download(event: "WatchEvent" | "PushEvent", completed: number) {
  return {
    event,
    state: "running",
    start_date: "2016-01-01",
    end_date: "2026-08-25",
    total_partitions: 3890,
    completed_partitions: completed,
    last_partition: "20210501",
    estimated_total_bytes: 1_000_000,
    checkpoint_error: null,
    quota_error: null,
    quota: {
      query_jobs: 10,
      billed_bytes: 100,
      processed_bytes: 100,
      free_tier_bytes: 1_099_511_627_776,
      remaining_bytes: 1_099_511_627_676,
      used_percent: 0.01,
      warning_percent: 80,
      stop_percent: 90,
      status: "正常",
      should_stop: false,
    },
  };
}

const datasetFixture = {
  datasetId: "githubarchive_watch_event",
  schemaVersion: 1,
  displayName: "GH Archive WatchEvent",
  source: "bigquery",
  partitionKey: "event_date",
  logicalUri: "lake://raw/bigquery/githubarchive_watch_event/schema=v1",
  state: "partial",
  startDate: "2016-01-01",
  endDate: "2026-08-25",
  readyPartitions: 1,
  failedPartitions: 0,
  missingPartitions: 1,
  totalPartitions: 2,
  totalRows: 10,
  totalBytes: 100,
  estimatedTotalBytes: 1_000,
  watermark: "2016-01-01",
  untrackedFileCount: 0,
  observedAt: "2026-08-27T00:00:00.000Z",
  registeredAt: "2026-08-27T00:00:01.000Z",
};

const partitionFixture = {
  datasetId: "githubarchive_watch_event",
  schemaVersion: 1,
  partitionKey: "event_date",
  partitionValue: "2016-01-01",
  sourcePartition: "20160101",
  state: "ready",
  validationState: "valid",
  logicalUri:
    "lake://raw/bigquery/githubarchive_watch_event/schema=v1/event_date=2016-01-01",
  checksum: "sha256:test",
  rowCount: 10,
  fileSizeBytes: 100,
  estimatedBytes: 1_000,
  observedAt: "2026-08-27T00:00:00.000Z",
};

const storageFixture = {
  storageId: "primary-data-volume",
  logicalUri: "storage://primary-data-volume",
  capacityBytes: 1_000_000,
  usedBytes: 100,
  availableBytes: 999_900,
  observedAt: "2026-08-27T00:00:00.000Z",
};

function fulfill(route: Route, data: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}
