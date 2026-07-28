import { defineConfig } from "vite";
import { resolve } from "node:path";

import { siteConfig } from "./site.config";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        notFound: resolve(import.meta.dirname, "404.html"),
      },
    },
  },
  plugins: [
    {
      name: "site-config",
      transformIndexHtml(html) {
        return html
          .replaceAll("__CANONICAL_SITE_URL__", siteConfig.canonicalUrl)
          .replaceAll("__REPOSITORY_URL__", siteConfig.repositoryUrl);
      },
    },
  ],
});
