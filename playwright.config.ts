import { defineConfig, devices } from "@playwright/test";

const previewUrl = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  reporter: [["line"], ["html", { open: "never" }]],
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    baseURL: previewUrl,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "firefox-mobile",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 12"] },
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
