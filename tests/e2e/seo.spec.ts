import { expect, test } from "@playwright/test";
import { HtmlValidate } from "html-validate";

const repositoryUrl = "https://github.com/spectra-g/ssh-key-pair-matcher";

test.use({ javaScriptEnabled: false });

test("@browser @seo exposes substantive matcher content without JavaScript", async ({
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
  await expect(page.getByRole("textbox", { name: "Public key" })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Private key" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Supported formats",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Check with ssh-keygen",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Common questions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Inspect the source code on GitHub" }),
  ).toHaveAttribute("href", repositoryUrl);
});

test("@browser @seo production HTML is valid and has parseable structured data", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const html = await response.text();

  const validator = new HtmlValidate({
    extends: ["html-validate:recommended"],
    rules: {
      "doctype-style": "off",
      "long-title": "off",
      "void-style": "off",
    },
  });
  const report = await validator.validateString(html, "http://127.0.0.1:4173/");
  expect(report.valid, JSON.stringify(report.results, null, 2)).toBe(true);

  const structuredDataSource = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/u,
  )?.[1];
  expect(structuredDataSource).toBeDefined();
  const structuredData = JSON.parse(structuredDataSource ?? "{}");
  expect(structuredData["@context"]).toBe("https://schema.org");
  expect(structuredData["@graph"]).toContainEqual({
    "@type": "WebSite",
    "@id": "https://sshkeymatch.com/#website",
    name: "SSH Key Pair Matcher",
    alternateName: "sshkeymatch.com",
    url: "https://sshkeymatch.com/",
  });
  expect(structuredData["@graph"]).toContainEqual(
    expect.objectContaining({
      "@type": "WebApplication",
      "@id": "https://sshkeymatch.com/#application",
      url: "https://sshkeymatch.com/",
      codeRepository: repositoryUrl,
      applicationCategory: "UtilitiesApplication",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    }),
  );
});

test("@browser @seo serves crawl, manifest, social, and noindex 404 assets", async ({
  request,
}) => {
  for (const path of [
    "/robots.txt",
    "/sitemap.xml",
    "/site.webmanifest",
    "/og/ssh-key-pair-matcher.png",
    "/favicon.svg",
    "/404.html",
  ]) {
    const response = await request.get(path);
    expect(response.ok(), path).toBe(true);
  }

  const notFoundHtml = await (await request.get("/404.html")).text();
  expect(notFoundHtml).toContain('name="robots" content="noindex, follow"');
  expect(notFoundHtml).toContain('href="/"');
});
