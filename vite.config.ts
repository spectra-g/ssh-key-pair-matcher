import { defineConfig } from "vite";

import { siteConfig } from "./site.config";

export default defineConfig({
  build: {
    outDir: "dist",
  },
  plugins: [
    {
      name: "site-config",
      transformIndexHtml(html) {
        return html.replaceAll(
          "__CANONICAL_SITE_URL__",
          siteConfig.canonicalUrl,
        );
      },
    },
  ],
});
