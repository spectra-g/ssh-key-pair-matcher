import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const releaseViewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "desktop-1280x720", width: 1280, height: 720 },
  { name: "mobile-390x844", width: 390, height: 844 },
] as const;

const themes = ["light", "dark"] as const;

async function expectInsideViewport(
  locator: Locator,
  viewport: { width: number; height: number },
): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    viewport.height,
  );
}

async function requiredAboveFoldElements(page: Page): Promise<Locator[]> {
  return [
    page.locator(".brand"),
    page.locator(".source-pending"),
    page.getByRole("button", { name: /Switch to (?:light|dark) theme/ }),
    page.getByRole("heading", {
      level: 1,
      name: "Do these SSH keys match?",
    }),
    page.locator(".hero__summary"),
    page.getByRole("heading", {
      level: 2,
      name: "Your keys never leave this browser",
    }),
    page.locator('label[for="public-key"]'),
    page.getByRole("textbox", { name: "Public key" }),
    page.locator('label[for="private-key"]'),
    page.getByRole("textbox", { name: "Private key" }),
    page.getByRole("button", { name: "Check key pair" }),
    page.getByRole("button", { name: "Wipe keys" }),
  ];
}

for (const viewport of releaseViewports) {
  for (const theme of themes) {
    test(`@browser @layout @above-fold @responsive @theme ${viewport.name} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);

      const expectedAction =
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
      await expect(
        page.getByRole("button", { name: expectedAction }),
      ).toBeVisible();
      await expect(page.locator("html")).not.toHaveAttribute("data-theme");
      const colorScheme = await page
        .locator("html")
        .evaluate((root) => getComputedStyle(root).colorScheme);
      expect(colorScheme).toBe(theme);

      for (const element of await requiredAboveFoldElements(page)) {
        await expectInsideViewport(element, viewport);
      }

      for (const action of [
        page.locator("#theme-toggle"),
        page.getByRole("button", { name: "Check key pair" }),
        page.getByRole("button", { name: "Wipe keys" }),
      ]) {
        const box = await action.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }

      const documentSize = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(documentSize.scrollWidth).toBe(documentSize.clientWidth);

      await expect(page).toHaveScreenshot(`${viewport.name}-${theme}.png`, {
        animations: "disabled",
        fullPage: false,
      });
    });
  }
}

test("@browser @privacy @theme follows the system until a document-only override", async ({
  page,
}) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== "http://127.0.0.1:4173") {
      remoteRequests.push(request.url());
    }
  });

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = page.locator("#theme-toggle");
  await expect(toggle).toHaveAccessibleName("Switch to dark theme");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(toggle).toHaveAccessibleName("Switch to light theme");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAccessibleName("Switch to dark theme");
  await expect(toggle).toBeFocused();

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAccessibleName("Switch to dark theme");

  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(toggle).toHaveAccessibleName("Switch to dark theme");

  const persistedState = await page.evaluate(() => ({
    localStorage: { ...localStorage },
    sessionStorage: { ...sessionStorage },
    cookie: document.cookie,
  }));
  expect(persistedState).toEqual({
    localStorage: {},
    sessionStorage: {},
    cookie: "",
  });
  expect(remoteRequests).toEqual([]);
});

test("@browser @layout @responsive reflows at 320 CSS pixels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);

  const publicKey = await page
    .getByRole("textbox", { name: "Public key" })
    .boundingBox();
  const privateKey = await page
    .getByRole("textbox", { name: "Private key" })
    .boundingBox();
  expect(publicKey).not.toBeNull();
  expect(privateKey).not.toBeNull();
  expect(privateKey?.y).toBeGreaterThan(
    (publicKey?.y ?? 0) + (publicKey?.height ?? 0),
  );
});

test("@browser @layout font fallbacks preserve the release layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*.woff2", async (route) => route.abort());
  await page.goto("/");

  for (const element of await requiredAboveFoldElements(page)) {
    await expectInsideViewport(element, { width: 390, height: 844 });
  }

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
});

test("@browser @layout production output excludes POC references", () => {
  const builtFiles = readdirSync(resolve("dist"), {
    recursive: true,
  }).map(String);

  expect(builtFiles).not.toContain("light-theme.png");
  expect(builtFiles).not.toContain("dark-theme.png");
  expect(builtFiles.every((file) => !file.includes("poc/"))).toBe(true);
});

for (const colorScheme of themes) {
  test(`@browser @theme ${colorScheme} theme preserves keyboard order and focus`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    const publicKey = page.getByRole("textbox", { name: "Public key" });
    const privateKey = page.getByRole("textbox", { name: "Private key" });
    const wipe = page.getByRole("button", { name: "Wipe keys" });
    const toggle = page.locator("#theme-toggle");
    await expect(publicKey).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(privateKey).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(wipe).toBeFocused();

    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      colorScheme === "dark" ? "light" : "dark",
    );
  });
}
