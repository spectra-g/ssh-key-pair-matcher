import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, posix, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { HtmlValidate } from "html-validate";
import { JSDOM } from "jsdom";

const canonicalUrl = "https://sshkeymatch.com/";
const repositoryUrl = "https://github.com/spectra-g/ssh-key-pair-matcher";
const expectedTitle =
  "SSH Key Pair Matcher | Check Public & Private Keys Locally";
const expectedDescription =
  "Check whether an SSH public key matches an OpenSSH private key. The comparison runs locally in your browser, with no uploads or storage.";
const maximumCompressedJavaScriptBytes = 35 * 1024;
const maximumInitialTransferBytes = 180 * 1024;
const maximumAssetBytes = 100 * 1024;

const distPath = resolve("dist");
const canonicalOrigin = new URL(canonicalUrl).origin;

function readDist(relativePath) {
  return readFileSync(resolve(distPath, relativePath), "utf8");
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
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

const scripts = [...indexDocument.querySelectorAll("script")];
assert(scripts.length === 2, "expected one JSON-LD and one application script");
assert(
  scripts.every((script) => {
    const type = script.getAttribute("type");
    return (
      (type === "application/ld+json" && !script.hasAttribute("src")) ||
      (type === "module" &&
        /^\/assets\/index-[A-Za-z0-9_-]+\.js$/u.test(
          script.getAttribute("src") ?? "",
        ))
    );
  }),
  "unexpected inline or external executable script",
);
assert(
  [...indexDocument.querySelectorAll("*")].every((element) =>
    [...element.attributes].every((attribute) => !/^on/iu.test(attribute.name)),
  ),
  "inline event handlers are forbidden",
);

const applicationScript = scripts.find(
  (script) => script.getAttribute("type") === "module",
);
assert(applicationScript !== undefined, "application module script is missing");
const applicationScriptPath = applicationScript
  .getAttribute("src")
  ?.replace(/^\//u, "");
assert(
  applicationScriptPath !== undefined,
  "application script path is missing",
);
const applicationJavaScript = readDist(applicationScriptPath);
assert(
  !/\beval\s*\(|\bFunction\s*\(/u.test(applicationJavaScript),
  "application JavaScript contains dynamic code generation",
);

const distFiles = filesUnder(distPath);
const distRelativePaths = distFiles.map((path) =>
  relative(distPath, path).replaceAll("\\", "/"),
);
const executablePaths = distRelativePaths.filter((path) =>
  /\.(?:[cm]?js|wasm)$/u.test(path),
);
assert(
  executablePaths.length === 1 && executablePaths[0] === applicationScriptPath,
  `unexpected executable files: ${executablePaths.join(", ")}`,
);

for (const path of distFiles) {
  const relativePath = relative(distPath, path).replaceAll("\\", "/");
  const size = statSync(path).size;
  assert(
    size <= maximumAssetBytes,
    `${relativePath} is ${size} bytes; individual assets must not exceed ${maximumAssetBytes} bytes`,
  );
}

const sourceMapPaths = distRelativePaths.filter((path) =>
  path.endsWith(".map"),
);
for (const sourceMapPath of sourceMapPaths) {
  const contents = readDist(sourceMapPath);
  assert(
    !/tests\/fixtures|OPENSSH PRIVATE KEY|fixture-passphrase/u.test(contents),
    `${sourceMapPath} contains disposable SSH fixture material`,
  );
}

function firstPartyResourcePath(value, baseUrl, label) {
  assert(
    !value.startsWith("data:") && !value.startsWith("blob:"),
    `${label} uses an embedded or blob runtime resource`,
  );
  const url = new URL(value, baseUrl);
  assert(
    url.origin === canonicalOrigin,
    `${label} uses third-party origin ${url.origin}`,
  );
  assert(
    url.search === "" && url.hash === "",
    `${label} must use a stable local path`,
  );
  const path = decodeURIComponent(url.pathname).replace(/^\/+/u, "");
  assert(path !== "" && !path.includes(".."), `${label} has an invalid path`);
  return path;
}

const initialResourcePaths = new Set(["index.html"]);
for (const element of indexDocument.querySelectorAll(
  'script[src], link[rel="stylesheet"][href], link[rel="icon"][href], link[rel="manifest"][href], link[rel="preload"][href], link[rel="modulepreload"][href], img[src], source[src]',
)) {
  const attribute = element.hasAttribute("src") ? "src" : "href";
  const value = element.getAttribute(attribute);
  assert(value !== null, `runtime ${element.localName} resource is missing`);
  initialResourcePaths.add(
    firstPartyResourcePath(
      value,
      canonicalUrl,
      `${element.localName}[${attribute}]`,
    ),
  );
}

for (const element of indexDocument.querySelectorAll("[srcset]")) {
  for (const candidate of (element.getAttribute("srcset") ?? "").split(",")) {
    const value = candidate.trim().split(/\s+/u)[0];
    if (value !== undefined && value !== "") {
      initialResourcePaths.add(
        firstPartyResourcePath(
          value,
          canonicalUrl,
          `${element.localName}[srcset]`,
        ),
      );
    }
  }
}

for (const stylesheetPath of [...initialResourcePaths].filter((path) =>
  path.endsWith(".css"),
)) {
  const stylesheet = readDist(stylesheetPath);
  const stylesheetUrl = new URL(
    posix.join("/", dirname(stylesheetPath), "/"),
    canonicalUrl,
  );
  for (const match of stylesheet.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gu)) {
    const value = match[2];
    if (value !== undefined) {
      initialResourcePaths.add(
        firstPartyResourcePath(value, stylesheetUrl, `${stylesheetPath} url()`),
      );
    }
  }
}

const manifestPath = [...initialResourcePaths].find((path) =>
  path.endsWith(".webmanifest"),
);
if (manifestPath !== undefined) {
  const runtimeManifest = JSON.parse(readDist(manifestPath));
  for (const icon of runtimeManifest.icons ?? []) {
    initialResourcePaths.add(
      firstPartyResourcePath(
        icon.src,
        new URL(`/${manifestPath}`, canonicalUrl),
        `${manifestPath} icon`,
      ),
    );
  }
}

for (const path of initialResourcePaths) {
  assert(
    statSync(resolve(distPath, path)).isFile(),
    `initial runtime resource is missing: ${path}`,
  );
}

const compressedJavaScriptBytes = gzipSync(
  readFileSync(resolve(distPath, applicationScriptPath)),
).length;
assert(
  compressedJavaScriptBytes <= maximumCompressedJavaScriptBytes,
  `compressed first-party JavaScript is ${compressedJavaScriptBytes} bytes; budget is ${maximumCompressedJavaScriptBytes} bytes`,
);

const initialTransferBytes = [...initialResourcePaths].reduce(
  (total, path) =>
    total + gzipSync(readFileSync(resolve(distPath, path))).length,
  0,
);
assert(
  initialTransferBytes <= maximumInitialTransferBytes,
  `compressed initial transfer is ${initialTransferBytes} bytes; budget is ${maximumInitialTransferBytes} bytes`,
);

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
const structuredDataGraph = structuredData["@graph"];
assert(Array.isArray(structuredDataGraph), "JSON-LD graph is missing");
const websiteStructuredData = structuredDataGraph.find(
  (entry) => entry["@type"] === "WebSite",
);
assert(
  websiteStructuredData?.name === "SSH Key Pair Matcher",
  "WebSite name is incorrect",
);
assert(
  websiteStructuredData?.alternateName === "sshkeymatch.com",
  "WebSite alternate name is incorrect",
);
assert(websiteStructuredData?.url === canonicalUrl, "WebSite URL is incorrect");
const applicationStructuredData = structuredDataGraph.find(
  (entry) => entry["@type"] === "WebApplication",
);
assert(applicationStructuredData !== undefined, "JSON-LD type is incorrect");
assert(
  applicationStructuredData.url === canonicalUrl,
  "WebApplication URL is incorrect",
);
assert(
  applicationStructuredData.codeRepository === repositoryUrl,
  "JSON-LD repository URL is incorrect",
);
assert(
  applicationStructuredData.applicationCategory === "UtilitiesApplication",
  "JSON-LD application category is incorrect",
);
assert(
  applicationStructuredData.operatingSystem.includes("browser"),
  "JSON-LD operating system is inaccurate",
);
assert(
  applicationStructuredData.offers?.price === "0",
  "JSON-LD free price is missing",
);

const repositoryLinks = indexDocument.querySelectorAll(
  `a[href="${repositoryUrl}"]`,
);
assert(
  repositoryLinks.length >= 3,
  "public repository must be linked in the header, content, and footer",
);

const visibleText = indexDocument.body.textContent?.replace(/\s+/gu, " ") ?? "";
for (const requiredText of [
  "Local-only • No uploads • No storage",
  "How it works",
  "Supported formats",
  "Check with ssh-keygen",
  "Reading fingerprints",
  "Encrypted private keys",
  "Troubleshooting",
  "public GitHub repository",
  "Privacy",
  "Common questions",
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
  "_headers",
  "404.html",
  "favicon.svg",
  "robots.txt",
  "site.webmanifest",
  "sitemap.xml",
  "og/ssh-key-pair-matcher.png",
]) {
  assert(statSync(resolve(distPath, file)).isFile(), `missing dist/${file}`);
}

const headersFile = readDist("_headers");
for (const requiredPolicy of [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "Referrer-Policy: no-referrer",
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY",
  "Permissions-Policy:",
  "Cross-Origin-Opener-Policy: same-origin",
]) {
  assert(
    headersFile.includes(requiredPolicy),
    `static response policy is missing: ${requiredPolicy}`,
  );
}
for (const forbiddenPolicy of ["'unsafe-inline'", "'unsafe-eval'"]) {
  assert(
    !headersFile.includes(forbiddenPolicy),
    `static response policy must not contain ${forbiddenPolicy}`,
  );
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
  [
    "dist assertions passed:",
    "HTML/metadata/security/runtime-origin/source-map checks;",
    `largest asset <= ${maximumAssetBytes / 1024} KiB;`,
    `gzip JavaScript ${(compressedJavaScriptBytes / 1024).toFixed(1)} KiB <= ${maximumCompressedJavaScriptBytes / 1024} KiB;`,
    `gzip initial transfer ${(initialTransferBytes / 1024).toFixed(1)} KiB <= ${maximumInitialTransferBytes / 1024} KiB`,
  ].join(" "),
);
