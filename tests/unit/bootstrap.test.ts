import { beforeEach, describe, expect, it, vi } from "vitest";

import { initializePage } from "../../src/bootstrap";

describe("project bootstrap", () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="app-status"></p>';
  });

  it("marks the semantic status region as enhanced", () => {
    initializePage(document);

    expect(document.querySelector("#app-status")).toHaveProperty(
      "dataset.enhanced",
      "true",
    );
  });

  it("fails clearly if the static page contract is broken", () => {
    document.body.innerHTML = "";

    expect(() => initializePage(document)).toThrow(
      "The page status element is missing.",
    );
  });

  it("wires the browser entry point", async () => {
    vi.resetModules();

    await import("../../src/main");

    expect(document.querySelector("#app-status")).toHaveProperty(
      "dataset.enhanced",
      "true",
    );
  });
});
