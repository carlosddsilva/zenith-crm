import { defineConfig, devices } from "@playwright/test";

process.loadEnvFile("e2e/.env.e2e");

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 900_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results/e2e",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    ...devices["Desktop Chrome"],
    channel: process.platform === "win32" ? "chrome" : undefined,
  },
  webServer: [
    {
      command:
        "node e2e/support/start-next.mjs",
      url: "http://127.0.0.1:3100/api/health/live",
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === "true",
      timeout: 180_000,
    },
    {
      command: "node e2e/support/provider-adapter.mjs",
      url: "http://127.0.0.1:3199/health",
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === "true",
      timeout: 30_000,
    },
    {
      command:
        "node e2e/support/start-worker.mjs",
      url: "http://127.0.0.1:3102/ready",
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === "true",
      timeout: 60_000,
    },
  ],
});
