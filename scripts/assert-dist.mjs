import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { HtmlValidate } from "html-validate";
import { JSDOM } from "jsdom";

const canonicalUrl = "https://sshkeypairmatcher.com/";
const repositoryUrl = "https://github.com/spectra-g/ssh-key-pair-matcher";
const expectedTitle =
  "SSH Key Pair Matcher — Check Public & Private Keys Locally";
const expectedDescription =
  "Check whether an SSH public key matches an OpenSSH private key. The comparison runs locally in your browser, with no uploads or storage.";

const distPath = resolve("dist");

function readDist(relativePath) {
  return readFileSync(resolve(distPath, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`dist assertion failed: ${message}`);
  }
}

function exactlyOne(document, selector, label) {
  const matches = document.querySelectorAll(selector);
  assert(
    matches.length === 1,
    `expected one ${label}, found ${matches.length}`,
  );
  return matches[0];
}

function formatValidationErrors(report) {
  return report.results
    .flatMap((result) =>
      result.messages.map(
        ({ line, column, message, ruleId }) =>
          `${result.filePath}:${line}:${column} ${message} (${ruleId})`,
      ),
    )
    .join("\n");
}

async function assertValidHtml(html, filename) {
  const validator = new HtmlValidate({
    extends: ["html-validate:recommended"],
    rules: {
      "doctype-style": "off",
      "long-title": "off",
      "void-style": "off",
    },
  });
  const report = await validator.validateString(html, filename);
  assert(report.valid, `invalid HTML:\n${formatValidationErrors(report)}`);
}

const indexHtml = readDist("index.html");
await assertValidHtml(indexHtml, "dist/index.html");
const indexDocument = new JSDOM(indexHtml).window.document;

const title = exactlyOne(indexDocument, "title", "title");
assert(title.textContent?.trim() === expectedTitle, "unexpected title text");

const description = exactlyOne(
  indexDocument,
  'meta[name="description"]',
  "meta description",
);
assert(
  description.getAttribute("content") === expectedDescription,
  "unexpected meta description",
);

const canonical = exactlyOne(
  indexDocument,
  'link[rel="canonical"]',
  "canonical link",
);
assert(
  canonical.getAttribute("href") === canonicalUrl,
  "canonical URL is incorrect",
);

const heading = exactlyOne(indexDocument, "h1", "H1");
assert(
  heading.textContent?.replace(/\s+/gu, " ").trim().includes("SSH public key"),
  "H1 does not describe the SSH public-key check",
);

const structuredDataElement = exactlyOne(
  indexDocument,
  'script[type="application/ld+json"]',
  "JSON-LD block",
);
const structuredData = JSON.parse(structuredDataElement.textContent ?? "");
assert(
  structuredData["@context"] === "https://schema.org",
  "JSON-LD context is incorrect",
);
assert(
  structuredData["@type"] === "WebApplication",
  "JSON-LD type is incorrect",
);
assert(structuredData.url === canonicalUrl, "JSON-LD URL is incorrect");
assert(
  structuredData.codeRepository === repositoryUrl,
  "JSON-LD repository URL is incorrect",
);
assert(
  structuredData.applicationCategory === "UtilitiesApplication",
  "JSON-LD application category is incorrect",
);
assert(
  structuredData.operatingSystem.includes("browser"),
  "JSON-LD operating system is inaccurate",
);
assert(structuredData.offers?.price === "0", "JSON-LD free price is missing");

const repositoryLinks = indexDocument.querySelectorAll(
  `a[href="${repositoryUrl}"]`,
);
assert(
  repositoryLinks.length >= 3,
  "public repository must be linked in the header, content, and footer",
);

const visibleText = indexDocument.body.textContent?.replace(/\s+/gu, " ") ?? "";
for (const requiredText of [
  "Your keys never leave this browser",
  "How browser-local SSH key matching works",
  "Supported key types and formats",
  "Check a key pair manually with ssh-keygen",
  "What SSH fingerprints mean",
  "Why encrypted OpenSSH private keys can be matched",
  "Common parse and mismatch errors",
  "Privacy and open-source design",
  "SSH key pair matcher FAQs",
]) {
  assert(
    visibleText.includes(requiredText),
    `missing static copy: ${requiredText}`,
  );
}

assert(
  indexDocument.querySelectorAll(".faq details").length >= 5,
  "expected at least five visible FAQ items",
);
assert(
  indexDocument.querySelector('meta[name="robots"][content*="noindex"]') ===
    null,
  "canonical page must not contain noindex",
);
assert(
  !/__[A-Z_]+__/u.test(indexHtml),
  "an unreplaced build placeholder remains",
);

const expectedSocialImage = `${canonicalUrl}og/ssh-key-pair-matcher.png`;
for (const selector of [
  'meta[property="og:image"]',
  'meta[name="twitter:image"]',
]) {
  assert(
    exactlyOne(indexDocument, selector, selector).getAttribute("content") ===
      expectedSocialImage,
    `${selector} does not use the canonical local image`,
  );
}

for (const file of [
  "404.html",
  "favicon.svg",
  "robots.txt",
  "site.webmanifest",
  "sitemap.xml",
  "og/ssh-key-pair-matcher.png",
]) {
  assert(statSync(resolve(distPath, file)).isFile(), `missing dist/${file}`);
}

const socialImage = readFileSync(
  resolve(distPath, "og/ssh-key-pair-matcher.png"),
);
assert(
  socialImage.subarray(1, 4).toString("ascii") === "PNG",
  "social card is not a PNG",
);
assert(
  socialImage.readUInt32BE(16) === 1200 && socialImage.readUInt32BE(20) === 630,
  "social card must be exactly 1200×630",
);

const robots = readDist("robots.txt");
assert(
  robots.includes(`Sitemap: ${canonicalUrl}sitemap.xml`),
  "robots.txt does not reference the canonical sitemap",
);

const sitemap = readDist("sitemap.xml");
const sitemapLocations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/gu)].map(
  ([, location]) => location,
);
assert(
  sitemapLocations.length === 1 && sitemapLocations[0] === canonicalUrl,
  "sitemap must contain only the canonical homepage",
);

const manifest = JSON.parse(readDist("site.webmanifest"));
assert(manifest.name === "SSH Key Pair Matcher", "manifest name is incorrect");
assert(
  manifest.start_url === "/" && manifest.scope === "/",
  "manifest URL scope is incorrect",
);

const notFoundHtml = readDist("404.html");
await assertValidHtml(notFoundHtml, "dist/404.html");
const notFoundDocument = new JSDOM(notFoundHtml).window.document;
assert(
  exactlyOne(notFoundDocument, 'meta[name="robots"]', "404 robots directive")
    .getAttribute("content")
    ?.includes("noindex"),
  "404 page must be noindex",
);
assert(
  notFoundDocument.querySelector('a[href="/"]') !== null,
  "404 page must link home",
);

globalThis.console.log(
  "dist assertions passed: HTML, metadata, JSON-LD, crawl files, source links, privacy copy, 404, and 1200×630 social card",
);
