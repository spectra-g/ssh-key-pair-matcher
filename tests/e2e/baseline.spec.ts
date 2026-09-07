import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const fixture = (name: string): string =>
  readFileSync(resolve("tests/fixtures", name), "utf8");

async function pressTab(
  page: Page,
  browserName: string,
  backwards = false,
): Promise<void> {
  const modifiers = [
    backwards ? "Shift" : "",
    browserName === "webkit" ? "Alt" : "",
  ].filter(Boolean);
  await page.keyboard.press([...modifiers, "Tab"].join("+"));
}

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
  await expect(page.getByLabel("Privacy guarantees")).toContainText(
    "Local-only • No uploads • No storage",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://sshkeymatch.com/",
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

  await publicKey.fill(fixture("ed25519-b-encrypted.pub"));
  await privateKey.fill(fixture("ed25519-b-encrypted"));
  await check.click();
  await expect(
    page.getByRole("heading", { name: "These keys match" }),
  ).toBeVisible();
  await expect(page.locator("#private-encrypted")).toHaveText("Yes");
});

test("@browser @privacy loads selected and dropped key files locally", async ({
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
  const publicText = fixture("ed25519-a.pub");
  const privateText = fixture("ed25519-a");
  const publicKey = page.getByRole("textbox", { name: "Public key" });
  const privateKey = page.getByRole("textbox", { name: "Private key" });
  const publicDropZone = page.locator("#public-key-drop-zone");
  const dataTransfer = await page.evaluateHandle((contents) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([contents], "id_ed25519.pub", { type: "text/plain" }),
    );
    return transfer;
  }, publicText);

  await publicDropZone.dispatchEvent("dragenter", { dataTransfer });
  await expect(publicDropZone).toHaveClass(/is-dragging/);
  await publicDropZone.dispatchEvent("drop", { dataTransfer });
  await expect(publicDropZone).not.toHaveClass(/is-dragging/);
  await expect(publicKey).toHaveValue(publicText);
  await expect(page.getByRole("status")).toHaveText(
    "id_ed25519.pub loaded into the public key field.",
  );

  await page.getByLabel("Choose private key file").setInputFiles({
    name: "id_ed25519",
    mimeType: "text/plain",
    buffer: Buffer.from(privateText),
  });
  await expect(privateKey).toHaveValue(privateText);
  await expect(page.getByRole("status")).toHaveText(
    "id_ed25519 loaded into the private key field.",
  );

  await page.getByRole("button", { name: "Check key pair" }).click();
  await expect(
    page.getByRole("heading", { name: "These keys match" }),
  ).toBeVisible();
  expect(remoteRequests).toEqual([]);
});

test("@browser completes the matcher and wipe flow with the keyboard", async ({
  browserName,
  page,
}) => {
  await page.goto("/");
  const publicKey = page.getByRole("textbox", { name: "Public key" });
  const privateKey = page.getByRole("textbox", { name: "Private key" });
  const wipe = page.getByRole("button", { name: "Wipe keys" });
  const check = page.getByRole("button", { name: "Check key pair" });

  await expect(publicKey).toBeFocused();
  await publicKey.fill(fixture("rsa-2048-a.pub"));
  await pressTab(page, browserName);
  await expect(page.getByLabel("Choose public key file")).toBeFocused();
  await pressTab(page, browserName);
  await expect(privateKey).toBeFocused();
  await privateKey.fill(fixture("rsa-2048-a"));
  await pressTab(page, browserName);
  await expect(page.getByLabel("Choose private key file")).toBeFocused();
  await pressTab(page, browserName);
  await expect(check).toBeFocused();
  await page.keyboard.press("Enter");
  const result = page.getByRole("region", { name: "These keys match" });
  await expect(result).toBeVisible();
  await expect(result).toBeFocused();
  await expect(page.locator("#public-key-size")).toHaveText("2048 bits");

  await pressTab(page, browserName, true);
  await expect(wipe).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(publicKey).toHaveValue("");
  await expect(privateKey).toHaveValue("");
  await expect(publicKey).toBeFocused();
});

test("@browser @privacy checks and wipes without third parties or persistence", async ({
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
