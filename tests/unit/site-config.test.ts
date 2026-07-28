import { describe, expect, it } from "vitest";

import { siteConfig } from "../../site.config";

describe("site configuration", () => {
  it("keeps the canonical URL and unconfirmed repository state explicit", () => {
    expect(siteConfig).toEqual({
      canonicalUrl: "https://sshkeypairmatcher.com/",
      repositoryUrl: null,
    });
  });
});
