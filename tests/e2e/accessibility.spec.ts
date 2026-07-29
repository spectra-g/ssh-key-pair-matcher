import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const fixture = (name: string): string =>
  readFileSync(resolve("tests/fixtures", name), "utf8");

async function expectNoSeriousAxeViolations(
  page: Page,
  state: string,
): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );
  expect(blockers, `${state}: ${JSON.stringify(blockers, null, 2)}`).toEqual(
    [],
  );
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`@browser @a11y ${colorScheme} theme covers initial, error, match, mismatch, and wiped states`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");

    const publicKey = page.getByRole("textbox", { name: "Public key" });
    const privateKey = page.getByRole("textbox", { name: "Private key" });
    const check = page.getByRole("button", { name: "Check key pair" });
    const wipe = page.getByRole("button", { name: "Wipe keys" });

    await expectNoSeriousAxeViolations(page, `${colorScheme} initial`);

    await publicKey.fill("malformed-public-key");
    await privateKey.fill("malformed-private-key");
    await expect(check).toBeEnabled();
    await expect(page.locator("#match-result")).toBeHidden();
    await check.click();
    await expect(publicKey).toHaveAttribute("aria-invalid", "true");
    await expect(privateKey).toHaveAttribute("aria-invalid", "true");
    await expectNoSeriousAxeViolations(page, `${colorScheme} error`);

    await publicKey.fill(fixture("ecdsa-p384-a.pub"));
    await privateKey.fill(fixture("ecdsa-p384-a"));
    await check.click();
    await expect(
      page.getByRole("heading", { name: "These keys match" }),
    ).toBeVisible();
    await expectNoSeriousAxeViolations(page, `${colorScheme} match`);

    await privateKey.fill(fixture("ecdsa-p256-b"));
    await check.click();
    await expect(
      page.getByRole("heading", { name: "These keys do not match" }),
    ).toBeVisible();
    await expectNoSeriousAxeViolations(page, `${colorScheme} mismatch`);

    await wipe.click();
    await expect(publicKey).toHaveValue("");
    await expect(privateKey).toHaveValue("");
    await expect(page.locator("#match-result")).toBeHidden();
    await expect(publicKey).toBeFocused();
  });
}
