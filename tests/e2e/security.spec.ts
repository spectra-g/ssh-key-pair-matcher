import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const headerPreviewUrl = "http://127.0.0.1:4174";
const canonicalUrl = "https://sshkeypairmatcher.com/";
const pagesUrl = "https://ssh-key-pair-matcher.pages.dev/";

const requiredCspDirectives = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
];

function headersContents(): string {
  return readFileSync(resolve("dist/_headers"), "utf8");
}

function ruleBlock(pattern: string): string {
  const contents = headersContents();
  const start = contents.indexOf(`${pattern}\n`);
  expect(start, `missing _headers rule: ${pattern}`).toBeGreaterThanOrEqual(0);
  const remainder = contents.slice(start + pattern.length + 1);
  const end = remainder.search(/^(?:\S|$)/mu);
  return end === -1 ? remainder : remainder.slice(0, end);
}

test("@browser @security @headers serves the complete static response policy", async ({
  request,
}) => {
  const response = await request.get(headerPreviewUrl);
  expect(response.status()).toBe(200);

  const headers = response.headers();
  for (const directive of requiredCspDirectives) {
    expect(headers["content-security-policy"]).toContain(directive);
  }
  expect(headers["content-security-policy"]).not.toMatch(
    /'unsafe-inline'|'unsafe-eval'|blob:/u,
  );
  expect(headers).toMatchObject({
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "cache-control": "public, max-age=0, must-revalidate",
    "x-robots-tag": "noindex",
  });
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["permissions-policy"]).toContain("microphone=()");
  expect(headers["permissions-policy"]).toContain("geolocation=()");
  expect(headers["permissions-policy"]).toContain(
    "publickey-credentials-get=()",
  );
});

test("@browser @security @headers keeps aliases noindex and the canonical domain indexable", () => {
  expect(ruleBlock(`${pagesUrl}*`)).toContain("X-Robots-Tag: noindex");
  expect(
    ruleBlock("https://:version.ssh-key-pair-matcher.pages.dev/*"),
  ).toContain("X-Robots-Tag: noindex");
  expect(headersContents()).not.toContain(`${canonicalUrl}*\n  X-Robots-Tag`);
});

test("@browser @security @headers gives only fingerprinted assets immutable caching", () => {
  expect(ruleBlock("/assets/*")).toContain(
    "Cache-Control: public, max-age=31536000, immutable",
  );
  expect(ruleBlock("/")).toContain(
    "Cache-Control: public, max-age=0, must-revalidate",
  );
  expect(ruleBlock("/*.html")).toContain(
    "Cache-Control: public, max-age=0, must-revalidate",
  );
  expect(ruleBlock("/robots.txt")).toContain(
    "Cache-Control: public, max-age=3600, must-revalidate",
  );
  expect(ruleBlock("/sitemap.xml")).toContain(
    "Cache-Control: public, max-age=3600, must-revalidate",
  );
  expect(
    headersContents().match(/^\s+Cache-Control:.*\bimmutable\b.*$/gmu),
  ).toHaveLength(1);
});

test("@browser @security @CSP permits normal use and blocks inline script and fetch", async ({
  page,
}) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));

  await page.goto(headerPreviewUrl);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "SSH public key",
  );
  await expect(page.locator("#matcher-form")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    consoleMessages.filter((message) =>
      /Content Security Policy|Refused to/u.test(message),
    ),
  ).toEqual([]);

  const result = await page.evaluate(async () => {
    const injectedScript = document.createElement("script");
    injectedScript.textContent = "window.__inlineScriptRan = true";
    document.head.append(injectedScript);

    let fetchError = "";
    try {
      await fetch("https://example.com/");
    } catch (error) {
      fetchError = error instanceof Error ? error.name : String(error);
    }

    return {
      fetchError,
      inlineScriptRan:
        "__inlineScriptRan" in
        (window as Window & { __inlineScriptRan?: true }),
    };
  });

  expect(result).toEqual({
    fetchError: "TypeError",
    inlineScriptRan: false,
  });
  expect(
    consoleMessages.some((message) => message.includes("connect-src")),
  ).toBe(true);
  expect(
    consoleMessages.some((message) => message.includes("script-src")),
  ).toBe(true);
});

test("@browser @security @CSP frame-ancestors prevents cross-origin framing", async ({
  page,
}) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.goto("http://127.0.0.1:4173/404.html");
  await page.evaluate((source) => {
    const frame = document.createElement("iframe");
    frame.src = source;
    document.body.append(frame);
  }, headerPreviewUrl);

  await expect
    .poll(() => consoleMessages.join("\n"))
    .toContain("frame-ancestors 'none'");
  expect(
    page.frames().some((frame) => frame.url() === `${headerPreviewUrl}/`),
  ).toBe(false);
});
