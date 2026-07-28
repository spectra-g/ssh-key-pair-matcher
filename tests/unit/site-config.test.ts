import { describe, expect, it } from "vitest";

import { siteConfig } from "../../site.config";

describe("site configuration", () => {
  it("keeps the canonical and verified public repository URLs explicit", () => {
    expect(siteConfig).toEqual({
      canonicalUrl: "https://sshkeypairmatcher.com/",
      repositoryUrl: "https://github.com/spectra-g/ssh-key-pair-matcher",
    });
  });
});
