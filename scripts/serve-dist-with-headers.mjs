import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

function patternExpression(pattern) {
  const escaped = pattern.replace(/[\\^$+.()|[\]{}]/gu, "\\$&");
  const withParameters = escaped.replace(/:[A-Za-z][A-Za-z0-9_]*/gu, "[^./]+");
  return new RegExp(`^${withParameters.replaceAll("*", ".*")}$`, "u");
}

function ruleMatches(pattern, url) {
  const candidate = pattern.startsWith("http")
    ? `${url.protocol}//${url.host}${url.pathname}`
    : url.pathname;
  return patternExpression(pattern).test(candidate);
}

export function parseHeadersFile(contents) {
  const rules = [];
  let currentRule;

  for (const line of contents.split(/\r?\n/gu)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    if (/^\s/u.test(line)) {
      if (currentRule === undefined) {
        throw new Error("A header appears before its URL pattern.");
      }
      const separator = trimmed.indexOf(":");
      if (separator < 1) {
        throw new Error(`Invalid header line: ${trimmed}`);
      }
      currentRule.headers.push([
        trimmed.slice(0, separator),
        trimmed.slice(separator + 1).trim(),
      ]);
      continue;
    }

    currentRule = { pattern: trimmed, headers: [] };
    rules.push(currentRule);
  }

  return rules;
}

export function headersForUrl(rules, value) {
  const url = new URL(value);
  const headers = new Map();
  for (const rule of rules) {
    if (!ruleMatches(rule.pattern, url)) {
      continue;
    }
    for (const [name, headerValue] of rule.headers) {
      headers.set(name.toLowerCase(), { name, value: headerValue });
    }
  }
  return Object.fromEntries(
    [...headers.values()].map(({ name, value: headerValue }) => [
      name,
      headerValue,
    ]),
  );
}

function resolveStaticPath(root, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const requestedPath = decodedPath.endsWith("/")
    ? `${decodedPath}index.html`
    : decodedPath;
  const candidate = resolve(root, `.${requestedPath}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return undefined;
  }
  try {
    return statSync(candidate).isFile() ? candidate : resolve(root, "404.html");
  } catch {
    return resolve(root, "404.html");
  }
}

export function startServer({
  root = resolve("dist"),
  headersPath = resolve(root, "_headers"),
  host = "127.0.0.1",
  port = 4174,
  noindex = false,
} = {}) {
  const rules = parseHeadersFile(readFileSync(headersPath, "utf8"));
  const server = createServer((request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host}`,
    );
    const staticPath = resolveStaticPath(root, requestUrl.pathname);
    if (staticPath === undefined) {
      response.writeHead(400).end("Bad request");
      return;
    }

    const headers = headersForUrl(rules, requestUrl);
    if (noindex) {
      headers["X-Robots-Tag"] = "noindex";
    }
    headers["Content-Type"] =
      mimeTypes.get(extname(staticPath)) ?? "application/octet-stream";
    if (
      staticPath.endsWith(`${sep}404.html`) &&
      requestUrl.pathname !== "/404.html"
    ) {
      response.writeHead(404, headers);
    } else {
      response.writeHead(200, headers);
    }
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(staticPath).pipe(response);
  });

  return new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolveStart(server));
  });
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const host = argument("--host", "127.0.0.1");
  const port = Number(argument("--port", "4174"));
  const noindex = process.argv.includes("--noindex");
  const server = await startServer({ host, port, noindex });
  process.stdout.write(`Header preview listening on http://${host}:${port}\n`);

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
