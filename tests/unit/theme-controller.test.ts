import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  initializeTheme,
  type ThemeController,
} from "../../src/ui/theme-controller";

const indexHtml = readFileSync(resolve("index.html"), "utf8");
const controllers: ThemeController[] = [];

class StubMediaQueryList extends EventTarget {
  readonly media = "(prefers-color-scheme: dark)";
  onchange: ((event: MediaQueryListEvent) => void) | null = null;

  constructor(public matches: boolean) {
    super();
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

function loadPageMarkup(): void {
  const parsed = new DOMParser().parseFromString(indexHtml, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  document.documentElement.removeAttribute("data-theme");
}

function start(mediaQuery: StubMediaQueryList): ThemeController {
  const controller = initializeTheme(document, {
    mediaQuery: mediaQuery as unknown as MediaQueryList,
  });
  controllers.push(controller);
  return controller;
}

beforeEach(() => {
  loadPageMarkup();
});

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.destroy();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("document-only theme control", () => {
  it("follows the light system theme and live changes before an override", () => {
    const mediaQuery = new StubMediaQueryList(false);
    start(mediaQuery);
    const toggle = screen.getByRole("button", {
      name: "Switch to dark theme",
    });

    expect(document.documentElement).not.toHaveAttribute("data-theme");
    mediaQuery.setMatches(true);

    expect(toggle).toHaveAccessibleName("Switch to light theme");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("starts from a dark system theme with the default browser media query", () => {
    const mediaQuery = new StubMediaQueryList(true);
    const matchMedia = vi.fn(() => mediaQuery);
    vi.stubGlobal("matchMedia", matchMedia);

    controllers.push(initializeTheme(document));

    expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeVisible();
  });

  it("overrides only the current document and keeps toggle focus", async () => {
    const mediaQuery = new StubMediaQueryList(false);
    start(mediaQuery);
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", {
      name: "Switch to dark theme",
    });

    await user.click(toggle);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(toggle).toHaveAccessibleName("Switch to light theme");
    expect(toggle).toHaveFocus();

    mediaQuery.setMatches(false);
    expect(toggle).toHaveAccessibleName("Switch to light theme");

    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(toggle).toHaveAccessibleName("Switch to dark theme");
  });

  it("removes listeners and the document override when destroyed", async () => {
    const mediaQuery = new StubMediaQueryList(false);
    const controller = start(mediaQuery);
    const toggle = screen.getByRole("button", {
      name: "Switch to dark theme",
    });
    await userEvent.setup().click(toggle);

    controller.destroy();
    controllers.splice(controllers.indexOf(controller), 1);
    mediaQuery.setMatches(true);
    await userEvent.setup().click(toggle);

    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(toggle).toHaveAccessibleName("Switch to dark theme");
  });

  it("fails clearly when its static document contract is broken", () => {
    document.querySelector("#theme-toggle")?.remove();

    expect(() =>
      initializeTheme(document, {
        mediaQuery: new StubMediaQueryList(false) as unknown as MediaQueryList,
      }),
    ).toThrow('The theme element "#theme-toggle" is missing.');
  });

  it("requires an attached browser window", () => {
    const detachedDocument = document.implementation.createHTMLDocument();

    expect(() =>
      initializeTheme(detachedDocument, {
        mediaQuery: new StubMediaQueryList(false) as unknown as MediaQueryList,
      }),
    ).toThrow("The theme control requires a browser window.");
  });

  it("does not use persistence or network APIs while changing themes", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const storageSpies = [
      vi.spyOn(Storage.prototype, "getItem"),
      vi.spyOn(Storage.prototype, "setItem"),
      vi.spyOn(Storage.prototype, "removeItem"),
      vi.spyOn(Storage.prototype, "clear"),
      vi.spyOn(Storage.prototype, "key"),
    ];
    start(new StubMediaQueryList(false));

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    for (const spy of storageSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });
});
