import { defineConfig, devices } from "@playwright/test";

const e2eURL = "http://127.0.0.1:8799";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: e2eURL,
    trace: "on-first-retry",
  },
  webServer: {
    // E2E 验证正式构建后的单进程 Web+BFF，避免 concurrently 中任一开发进程
    // 退出时只留下模糊的启动错误。独立端口也不会碰撞本机已有的 8787 运维隧道。
    command: "pnpm build && pnpm start",
    url: e2eURL,
    env: { ...process.env, PORT: "8799" },
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
