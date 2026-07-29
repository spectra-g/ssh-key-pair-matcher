import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { BrowserContext, Page, Request } from "@playwright/test";

const fixture = (name: string): string =>
  readFileSync(resolve("tests/fixtures", name), "utf8");

const keySentinel = "TEST_KEY_SENTINEL";
const privateKeySentinel = ["-----BEGIN", "OPENSSH PRIVATE KEY-----"].join(" ");

interface RequestRecord {
  method: string;
  url: string;
  body: string | null;
}

interface PrivacyAuditState {
  apiCalls: string[];
  url: string;
  historyState: unknown;
  cookie: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDbDatabases: Array<{ name?: string; version?: number }>;
  cacheNames: string[];
  serviceWorkerControlled: boolean;
}

async function installPrivacyApiAudit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auditedWindow = window as Window & {
      __privacyApiCalls?: string[];
    };
    const calls: string[] = [];
    const record = (name: string): void => {
      calls.push(name);
    };
    auditedWindow.__privacyApiCalls = calls;

    window.fetch = new Proxy(window.fetch, {
      apply(target, thisArgument, argumentsList) {
        record("fetch");
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    });
    XMLHttpRequest.prototype.open = new Proxy(XMLHttpRequest.prototype.open, {
      apply(target, thisArgument, argumentsList) {
        record("xhr.open");
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    });
    XMLHttpRequest.prototype.send = new Proxy(XMLHttpRequest.prototype.send, {
      apply(target, thisArgument, argumentsList) {
        record("xhr.send");
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    });
    Navigator.prototype.sendBeacon = new Proxy(Navigator.prototype.sendBeacon, {
      apply(target, thisArgument, argumentsList) {
        record("beacon");
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    });
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, argumentsList, newTarget) {
        record("websocket");
        return Reflect.construct(target, argumentsList, newTarget);
      },
    });
    window.EventSource = new Proxy(window.EventSource, {
      construct(target, argumentsList, newTarget) {
        record("eventsource");
        return Reflect.construct(target, argumentsList, newTarget);
      },
    });
    if ("ServiceWorkerContainer" in window) {
      ServiceWorkerContainer.prototype.register = new Proxy(
        ServiceWorkerContainer.prototype.register,
        {
          apply(target, thisArgument, argumentsList) {
            record("service-worker.register");
            return Reflect.apply(target, thisArgument, argumentsList);
          },
        },
      );
    }
    HTMLFormElement.prototype.submit = new Proxy(
      HTMLFormElement.prototype.submit,
      {
        apply(target, thisArgument, argumentsList) {
          record("form.submit");
          return Reflect.apply(target, thisArgument, argumentsList);
        },
      },
    );
    HTMLFormElement.prototype.requestSubmit = new Proxy(
      HTMLFormElement.prototype.requestSubmit,
      {
        apply(target, thisArgument, argumentsList) {
          record("form.requestSubmit");
          return Reflect.apply(target, thisArgument, argumentsList);
        },
      },
    );
    History.prototype.pushState = new Proxy(History.prototype.pushState, {
      apply(target, thisArgument, argumentsList) {
        record("history.pushState");
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    });
    History.prototype.replaceState = new Proxy(History.prototype.replaceState, {
      apply(target, thisArgument, argumentsList) {
        record("history.replaceState");
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    });
    window.addEventListener(
      "submit",
      (event) => {
        if (!event.defaultPrevented) {
          record("form.navigation");
        }
      },
      false,
    );
  });
}

function recordRequests(page: Page): {
  records: RequestRecord[];
  start(): void;
} {
  const records: RequestRecord[] = [];
  let started = false;
  page.on("request", (request: Request) => {
    if (started) {
      records.push({
        method: request.method(),
        url: request.url(),
        body: request.postData(),
      });
    }
  });
  return {
    records,
    start(): void {
      started = true;
    },
  };
}

async function waitForInitialAssets(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
}

async function auditState(
  page: Page,
  context: BrowserContext,
): Promise<PrivacyAuditState & { contextCookies: unknown[] }> {
  const pageState = await page.evaluate(async () => {
    const auditedWindow = window as Window & {
      __privacyApiCalls?: string[];
    };
    return {
      apiCalls: [...(auditedWindow.__privacyApiCalls ?? [])],
      url: location.href,
      historyState: history.state as unknown,
      cookie: document.cookie,
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
      indexedDbDatabases: await indexedDB.databases(),
      cacheNames: await caches.keys(),
      serviceWorkerControlled: navigator.serviceWorker.controller !== null,
    };
  });
  return {
    ...pageState,
    contextCookies: await context.cookies(),
  };
}

async function captureSafeOutput(page: Page): Promise<string> {
  return page
    .locator(
      "#app-status, #public-key-error, #private-key-error, #match-result",
    )
    .evaluateAll((elements) =>
      elements.map((element) => element.outerHTML).join("\n"),
    );
}

function expectNoKeySentinel(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(keySentinel);
  expect(serialized).not.toContain(privateKeySentinel);
}

test("@browser @privacy records zero application activity through every tool action", async ({
  context,
  page,
}) => {
  await installPrivacyApiAudit(page);
  const requests = recordRequests(page);
  const consoleMessages: string[] = [];
  let recordConsole = false;
  page.on("console", (message) => {
    if (recordConsole) {
      consoleMessages.push(message.text());
    }
  });

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await waitForInitialAssets(page);
  requests.start();
  recordConsole = true;

  const publicKey = page.getByRole("textbox", { name: "Public key" });
  const privateKey = page.getByRole("textbox", { name: "Private key" });
  const check = page.getByRole("button", { name: "Check key pair" });
  const wipe = page.getByRole("button", { name: "Wipe keys" });
  const toggle = page.locator("#theme-toggle");
  const renderedSnapshots: string[] = [];

  await toggle.click();
  await publicKey.fill(`${fixture("ed25519-a.pub").trim()} ${keySentinel}`);
  await privateKey.fill(fixture("ed25519-a"));
  await check.click();
  await expect(
    page.getByRole("heading", { name: "These keys match" }),
  ).toBeVisible();
  renderedSnapshots.push(await captureSafeOutput(page));

  await toggle.click();
  await privateKey.fill(fixture("ed25519-b-encrypted"));
  await check.click();
  await expect(
    page.getByRole("heading", { name: "These keys do not match" }),
  ).toBeVisible();
  renderedSnapshots.push(await captureSafeOutput(page));

  await publicKey.fill(`not-a-public-key ${keySentinel}`);
  await privateKey.fill("not-a-private-key");
  await check.click();
  await expect(publicKey).toHaveAttribute("aria-invalid", "true");
  await expect(privateKey).toHaveAttribute("aria-invalid", "true");
  renderedSnapshots.push(await captureSafeOutput(page));

  await wipe.click();
  await expect(publicKey).toHaveValue("");
  await expect(privateKey).toHaveValue("");
  await expect(publicKey).toBeFocused();
  renderedSnapshots.push(await captureSafeOutput(page));

  const state = await auditState(page, context);
  expect(requests.records).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(state).toEqual({
    apiCalls: [],
    url: "http://127.0.0.1:4173/",
    historyState: null,
    cookie: "",
    localStorage: {},
    sessionStorage: {},
    indexedDbDatabases: [],
    cacheNames: [],
    serviceWorkerControlled: false,
    contextCookies: [],
  });
  expectNoKeySentinel(requests.records);
  expectNoKeySentinel(consoleMessages);
  expectNoKeySentinel(renderedSnapshots);
  expectNoKeySentinel(state);
});

test("@browser @privacy @offline @wipe keeps match, mismatch, errors, and wipe local after load", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await waitForInitialAssets(page);
  const requests = recordRequests(page);
  requests.start();
  await context.setOffline(true);

  const publicKey = page.getByRole("textbox", { name: "Public key" });
  const privateKey = page.getByRole("textbox", { name: "Private key" });
  const check = page.getByRole("button", { name: "Check key pair" });

  await publicKey.fill(fixture("ed25519-a.pub"));
  await privateKey.fill(fixture("ed25519-a"));
  await check.click();
  await expect(
    page.getByRole("heading", { name: "These keys match" }),
  ).toBeVisible();

  await privateKey.fill(fixture("ed25519-b-encrypted"));
  await check.click();
  await expect(
    page.getByRole("heading", { name: "These keys do not match" }),
  ).toBeVisible();

  await publicKey.fill("malformed-public-key");
  await privateKey.fill("malformed-private-key");
  await check.click();
  await expect(publicKey).toHaveAttribute("aria-invalid", "true");
  await expect(privateKey).toHaveAttribute("aria-invalid", "true");

  await page.getByRole("button", { name: "Wipe keys" }).click();
  await expect(publicKey).toHaveValue("");
  await expect(privateKey).toHaveValue("");
  await expect(publicKey).toBeFocused();
  expect(requests.records).toEqual([]);
});

test("@browser @privacy @wipe reload and back navigation clear keys and theme state", async ({
  context,
  page,
}) => {
  const requestUrls: string[] = [];
  page.on("request", (request) => requestUrls.push(request.url()));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const publicKey = page.getByRole("textbox", { name: "Public key" });
  const privateKey = page.getByRole("textbox", { name: "Private key" });
  const toggle = page.locator("#theme-toggle");

  await publicKey.fill(`${fixture("ed25519-a.pub").trim()} ${keySentinel}`);
  await privateKey.fill(fixture("ed25519-a"));
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(publicKey).toHaveValue("");
  await expect(privateKey).toHaveValue("");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(toggle).toHaveAccessibleName("Switch to dark theme");

  await publicKey.fill(`${fixture("ed25519-a.pub").trim()} ${keySentinel}`);
  await privateKey.fill(fixture("ed25519-a"));
  await toggle.click();
  await page.goto("/404.html");
  await page.goBack();
  await expect(publicKey).toHaveValue("");
  await expect(privateKey).toHaveValue("");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(toggle).toHaveAccessibleName("Switch to dark theme");

  const state = await auditState(page, context);
  expect(state.localStorage).toEqual({});
  expect(state.sessionStorage).toEqual({});
  expect(state.indexedDbDatabases).toEqual([]);
  expect(state.cacheNames).toEqual([]);
  expect(state.cookie).toBe("");
  expect(state.contextCookies).toEqual([]);
  expect(state.historyState).toBeNull();
  expectNoKeySentinel(requestUrls);
  expectNoKeySentinel(state);
  expect(requestUrls.every((url) => !/[?&](?:theme|key)=/u.test(url))).toBe(
    true,
  );
});

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

test("@browser @privacy production files contain no pasted-key sentinels", () => {
  for (const path of filesUnder(resolve("dist"))) {
    const contents = readFileSync(path);
    expect(contents.includes(Buffer.from(keySentinel)), path).toBe(false);
    expect(contents.includes(Buffer.from(privateKeySentinel)), path).toBe(
      false,
    );
  }
});
