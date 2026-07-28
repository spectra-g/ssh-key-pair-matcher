import { defineConfig, devices } from "@playwright/test";

const previewUrl = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: [["line"], ["html", { open: "never" }]],
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    baseURL: previewUrl,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run preview -- --host 127.0.0.1 --port 4173",
      url: previewUrl,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
    {
      command:
        "node scripts/serve-dist-with-headers.mjs --host 127.0.0.1 --port 4174 --noindex",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
  ],
});
