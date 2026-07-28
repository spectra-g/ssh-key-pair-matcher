import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("@browser serves the semantic production page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "SSH Key Pair Matcher" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your keys never leave this browser."),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://sshkeypairmatcher.com/",
  );
  await expect(page.locator("#app-status")).toHaveAttribute(
    "data-enhanced",
    "true",
  );
});

test("@a11y has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );

  expect(blockers).toEqual([]);
});

test("@privacy loads without third parties or browser persistence", async ({
  page,
}) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== "http://127.0.0.1:4173") {
      remoteRequests.push(request.url());
    }
  });

  await page.goto("/");

  const persistedState = await page.evaluate(() => ({
    localStorage: { ...localStorage },
    sessionStorage: { ...sessionStorage },
    cookie: document.cookie,
    serviceWorkerControlled: navigator.serviceWorker?.controller !== null,
  }));

  expect(remoteRequests).toEqual([]);
  expect(persistedState).toEqual({
    localStorage: {},
    sessionStorage: {},
    cookie: "",
    serviceWorkerControlled: false,
  });
});
