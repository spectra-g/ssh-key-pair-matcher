import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixture = (name: string): string =>
  readFileSync(resolve("tests/fixtures", name), "utf8");

test("@browser serves and operates the semantic production matcher", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Check whether an SSH public key matches a private key",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Your keys never leave this browser"),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://sshkeypairmatcher.com/",
  );
  const publicKey = page.getByRole("textbox", { name: "Public key" });
  const privateKey = page.getByRole("textbox", { name: "Private key" });
  const check = page.getByRole("button", { name: "Check key pair" });
  await expect(publicKey).toBeFocused();
  await expect(publicKey).toHaveValue("");
  await expect(privateKey).toHaveValue("");
  await expect(check).toBeDisabled();

  await publicKey.fill(fixture("ed25519-a.pub"));
  await privateKey.fill(fixture("ed25519-a"));
  await expect(check).toBeEnabled();
  await check.press("Enter");
  await expect(
    page.getByRole("heading", { name: "These keys match" }),
  ).toBeVisible();
  await expect(page.locator("#private-encrypted")).toHaveText("No");

  await publicKey.fill(`${fixture("ed25519-a.pub")} changed`);
  await expect(
    page.getByRole("heading", { name: "These keys match" }),
  ).toBeHidden();

  await page.getByRole("button", { name: "Wipe keys" }).click();
  await expect(publicKey).toHaveValue("");
  await expect(privateKey).toHaveValue("");
  await expect(publicKey).toBeFocused();

  await publicKey.fill(fixture("ed25519-a.pub"));
  await privateKey.fill(fixture("ed25519-a"));
  await page.reload();
  await expect(publicKey).toHaveValue("");
  await expect(privateKey).toHaveValue("");

  await publicKey.fill(fixture("ed25519-a.pub"));
  await privateKey.fill(fixture("ed25519-a"));
  await page.goto("about:blank");
  await page.goBack();
  await expect(publicKey).toHaveValue("");
  await expect(privateKey).toHaveValue("");
});

test("@browser reports field errors and encrypted mismatches", async ({
  page,
}) => {
  await page.goto("/");
  const publicKey = page.getByRole("textbox", { name: "Public key" });
  const privateKey = page.getByRole("textbox", { name: "Private key" });
  const check = page.getByRole("button", { name: "Check key pair" });

  await publicKey.fill("not-a-public-key");
  await privateKey.fill("not-a-private-key");
  await check.click();
  await expect(publicKey).toHaveAttribute("aria-invalid", "true");
  await expect(privateKey).toHaveAttribute("aria-invalid", "true");
  await expect(publicKey).toBeFocused();

  await publicKey.fill(fixture("ed25519-a.pub"));
  await privateKey.fill(fixture("ed25519-b-encrypted"));
  await check.click();
  await expect(
    page.getByRole("heading", { name: "These keys do not match" }),
  ).toBeVisible();
  await expect(page.locator("#private-encrypted")).toHaveText("Yes");
  await expect(page.locator("#match-result")).not.toContainText(
    fixture("ed25519-b-encrypted"),
  );
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`@a11y ${colorScheme} theme has no serious or critical axe violations`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    const results = await new AxeBuilder({ page }).analyze();
    const blockers = results.violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    );

    expect(blockers).toEqual([]);
  });
}

test("@privacy checks and wipes without third parties or persistence", async ({
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
  await page
    .getByRole("textbox", { name: "Public key" })
    .fill(fixture("ed25519-a.pub"));
  await page
    .getByRole("textbox", { name: "Private key" })
    .fill(fixture("ed25519-a"));
  await page.getByRole("button", { name: "Check key pair" }).click();
  await page.getByRole("button", { name: "Wipe keys" }).click();

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
