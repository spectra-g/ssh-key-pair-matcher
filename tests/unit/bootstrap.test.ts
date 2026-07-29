import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, screen, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initializePage } from "../../src/bootstrap";
import { matchKeyPair } from "../../src/core/match-key-pair";
import type { MatchResult } from "../../src/core/types";
import {
  initializeMatcher,
  type MatcherController,
  type MatcherControllerOptions,
} from "../../src/ui/matcher-controller";
import { fixture } from "./core-test-helpers";

const indexHtml = readFileSync(resolve("index.html"), "utf8");
const controllers: MatcherController[] = [];

class StubMediaQueryList extends EventTarget {
  matches = false;
  readonly media = "(prefers-color-scheme: dark)";
  onchange: ((event: MediaQueryListEvent) => void) | null = null;
}

function loadPageMarkup(): void {
  const parsed = new DOMParser().parseFromString(indexHtml, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
}

function start(options: MatcherControllerOptions = {}): MatcherController {
  const controller = initializeMatcher(document, options);
  controllers.push(controller);
  return controller;
}

async function pasteKeys(
  publicKeyText: string,
  privateKeyText: string,
): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("textbox", { name: "Public key" }));
  await user.paste(publicKeyText);
  await user.click(screen.getByRole("textbox", { name: "Private key" }));
  await user.paste(privateKeyText);
}

beforeEach(() => {
  const mediaQuery = new StubMediaQueryList();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQuery),
  );
  loadPageMarkup();
});

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.destroy();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("matcher bootstrap and static form contract", () => {
  it("starts blank, focused, and disabled with the complete semantic form", () => {
    const publicKey = screen.getByRole("textbox", { name: "Public key" });
    const privateKey = screen.getByRole("textbox", { name: "Private key" });
    const form = publicKey.closest("form");
    (publicKey as HTMLTextAreaElement).value = "browser-restored public key";
    (privateKey as HTMLTextAreaElement).value = "browser-restored private key";

    const controller = initializePage(document);
    controllers.push(controller);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Your keys never leave this browser",
      }),
    ).toBeVisible();
    expect(form).not.toHaveAttribute("action");
    expect(form).toHaveAttribute("novalidate");
    expect(publicKey).toHaveAttribute("spellcheck", "false");
    expect(publicKey).toHaveAttribute("autocorrect", "off");
    expect(publicKey).toHaveAttribute("autocapitalize", "none");
    expect(publicKey).toHaveAttribute("autocomplete", "off");
    expect(privateKey).toHaveAttribute("autocomplete", "new-password");
    expect(publicKey).toHaveValue("");
    expect(privateKey).toHaveValue("");
    expect(publicKey).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Check key pair" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Paste both keys to enable checking."),
    ).toHaveAttribute("id", "submit-help");

    controller.wipe();
    expect(publicKey).toHaveFocus();
  });

  it("fails clearly when the static document contract is broken", () => {
    document.body.innerHTML = "";

    expect(() => initializePage(document)).toThrow(
      'The matcher element "#matcher-form" is missing.',
    );
  });

  it("requires an attached browser window", () => {
    const detachedDocument = document.implementation.createHTMLDocument();

    expect(() => initializePage(detachedDocument)).toThrow(
      "The matcher requires a browser window.",
    );
  });

  it("wires the browser entry point", async () => {
    vi.resetModules();

    await import("../../src/main");

    expect(screen.getByRole("textbox", { name: "Public key" })).toHaveFocus();
  });
});

describe("checking key pairs", () => {
  it("shows a matching key's safe metadata and clears stale results", async () => {
    start();
    const publicText = fixture("ed25519-a.pub");
    const privateText = fixture("ed25519-a");
    await pasteKeys(publicText, privateText);
    const submit = screen.getByRole("button", { name: "Check key pair" });

    expect(submit).toBeEnabled();
    expect(
      screen.getByText("Ready to check locally. No keys will be uploaded."),
    ).toBeVisible();
    submit.focus();
    await userEvent.setup().keyboard("{Enter}");

    const result = await screen.findByRole("region", {
      name: "These keys match",
    });
    expect(result).toHaveFocus();
    expect(result).toHaveClass("result--match");
    expect(result).toHaveTextContent("Ed25519");
    expect(result).toHaveTextContent("256 bits");
    expect(result).toHaveTextContent(
      "SHA256:HYlVUdTA8RgiZHuuLxoktofQHNHu9yQPnSWIPeHz93E",
    );
    expect(result).toHaveTextContent(
      "MD5:66:c2:f9:20:5d:2b:f8:b7:92:f9:10:cf:31:d7:ea:dc",
    );
    expect(
      within(result).getByText("No", { selector: "#private-encrypted" }),
    ).toBeVisible();
    expect(result).not.toHaveTextContent(privateText);
    expect(result).not.toHaveTextContent(publicText);
    expect(result).toHaveTextContent(
      "MD5 is shown only for compatibility identification",
    );

    await userEvent
      .setup()
      .type(screen.getByRole("textbox", { name: "Public key" }), "changed");

    expect(result).not.toBeVisible();
    expect(result.querySelector("#result-summary")).toHaveTextContent("");
    expect(result.querySelector("#public-sha256")).toHaveTextContent("");
    expect(result.querySelector("#private-sha256")).toHaveTextContent("");
    expect(screen.getByRole("form")).not.toHaveAttribute("data-result");
  });

  it("shows both sides of a mismatch and labels encrypted private keys", async () => {
    start();
    await pasteKeys(fixture("ed25519-a.pub"), fixture("ed25519-b-encrypted"));

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Check key pair" }));

    const result = await screen.findByRole("region", {
      name: "These keys do not match",
    });
    expect(result).toHaveClass("result--no-match");
    expect(result).toHaveTextContent(
      "The two keys have different public components.",
    );
    expect(
      within(result).getByText("Yes", { selector: "#private-encrypted" }),
    ).toBeVisible();
    expect(result.querySelector("#public-sha256")?.textContent).not.toBe(
      result.querySelector("#private-sha256")?.textContent,
    );
  });

  it("shows field-specific errors and focuses the first invalid field", async () => {
    start();
    const user = userEvent.setup();
    const publicKey = screen.getByRole("textbox", { name: "Public key" });
    const privateKey = screen.getByRole("textbox", { name: "Private key" });
    await user.type(publicKey, "not-a-public-key");
    await user.type(privateKey, "not-a-private-key");
    await user.click(screen.getByRole("button", { name: "Check key pair" }));

    expect(
      screen.getByText("Fix both highlighted key fields and check again."),
    ).toBeVisible();
    expect(publicKey).toHaveAttribute("aria-invalid", "true");
    expect(privateKey).toHaveAttribute("aria-invalid", "true");
    expect(publicKey).toHaveFocus();

    await user.clear(publicKey);
    await user.paste(fixture("ed25519-a.pub"));
    await user.click(screen.getByRole("button", { name: "Check key pair" }));

    expect(
      screen.getByText("Fix the highlighted key field and check again."),
    ).toBeVisible();
    expect(publicKey).toHaveAttribute("aria-invalid", "false");
    expect(privateKey).toHaveAttribute("aria-invalid", "true");
    expect(privateKey).toHaveFocus();
  });

  it("keeps an obsolete asynchronous result from reappearing", async () => {
    const publicText = fixture("ed25519-a.pub");
    const privateText = fixture("ed25519-a");
    const expected = await matchKeyPair(publicText, privateText);
    let resolveMatch: (result: MatchResult) => void = () => undefined;
    const pendingMatch = new Promise<MatchResult>((resolve) => {
      resolveMatch = resolve;
    });
    start({ match: () => pendingMatch });
    await pasteKeys(publicText, privateText);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Check key pair" }));
    expect(screen.getByRole("form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Checking locally in this browser.")).toBeVisible();

    fireEvent.input(screen.getByRole("textbox", { name: "Public key" }), {
      target: { value: `${publicText} changed` },
    });
    resolveMatch(expected);
    await Promise.resolve();

    expect(screen.getByRole("form")).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByText("These keys match")).not.toBeInTheDocument();
  });

  it("uses a safe generic message for an unexpected matching failure", async () => {
    start({ match: () => Promise.reject(new Error("sensitive detail")) });
    await pasteKeys(fixture("ed25519-a.pub"), fixture("ed25519-a"));

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Check key pair" }));

    expect(
      await screen.findByText(
        "The keys could not be checked. Wipe them and try again.",
      ),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent("sensitive detail");
  });

  it("ignores an obsolete asynchronous failure", async () => {
    let rejectMatch: (error: Error) => void = () => undefined;
    const pendingMatch = new Promise<MatchResult>((_resolve, reject) => {
      rejectMatch = reject;
    });
    start({ match: () => pendingMatch });
    await pasteKeys(fixture("ed25519-a.pub"), fixture("ed25519-a"));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Check key pair" }));

    fireEvent.input(screen.getByRole("textbox", { name: "Private key" }), {
      target: { value: "changed" },
    });
    rejectMatch(new Error("obsolete failure"));
    await Promise.resolve();

    expect(
      screen.queryByText(
        "The keys could not be checked. Wipe them and try again.",
      ),
    ).not.toBeInTheDocument();
  });
});

describe("wipe and lifecycle behavior", () => {
  it("wipes inputs, errors, results, announcements, and CSS state", async () => {
    const controller = start();
    await pasteKeys(fixture("ed25519-a.pub"), fixture("ed25519-a"));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Check key pair" }));
    await screen.findByText("These keys match");

    controller.wipe();

    expect(screen.getByRole("textbox", { name: "Public key" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Private key" })).toHaveValue(
      "",
    );
    expect(screen.getByRole("textbox", { name: "Public key" })).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Check key pair" }),
    ).toBeDisabled();
    expect(screen.getByRole("form")).not.toHaveAttribute("data-result");
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(document.querySelector("#match-result")).not.toBeVisible();
  });

  it("wipes on pagehide and persisted pageshow only", () => {
    start();
    const publicKey = screen.getByRole("textbox", { name: "Public key" });
    const privateKey = screen.getByRole("textbox", { name: "Private key" });
    fireEvent.input(publicKey, { target: { value: "public" } });
    fireEvent.input(privateKey, { target: { value: "private" } });

    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    expect(publicKey).toHaveValue("");
    expect(privateKey).toHaveValue("");

    fireEvent.input(publicKey, { target: { value: "restored public" } });
    fireEvent.input(privateKey, { target: { value: "restored private" } });
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: false }),
    );
    expect(publicKey).toHaveValue("restored public");

    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    expect(publicKey).toHaveValue("");
    expect(privateKey).toHaveValue("");
    expect(publicKey).toHaveFocus();
  });

  it("removes all listeners when destroyed", async () => {
    const controller = start();
    controller.destroy();
    controllers.splice(controllers.indexOf(controller), 1);
    const publicKey = screen.getByRole("textbox", { name: "Public key" });
    const privateKey = screen.getByRole("textbox", { name: "Private key" });
    fireEvent.input(publicKey, { target: { value: fixture("ed25519-a.pub") } });
    fireEvent.input(privateKey, { target: { value: fixture("ed25519-a") } });

    fireEvent.submit(screen.getByRole("form"));
    await Promise.resolve();

    expect(screen.queryByText("These keys match")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check key pair" }),
    ).toBeDisabled();
  });
});

describe("privacy guard", () => {
  it("does not touch network, persistence, URL, form, or console APIs", async () => {
    const fetchSpy = vi.fn();
    const webSocketSpy = vi.fn();
    const indexedDbOpen = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("WebSocket", webSocketSpy);
    vi.stubGlobal("indexedDB", { open: indexedDbOpen });
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    const xhrSend = vi.spyOn(XMLHttpRequest.prototype, "send");
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: beacon,
    });
    const storageSpies = [
      vi.spyOn(Storage.prototype, "getItem"),
      vi.spyOn(Storage.prototype, "setItem"),
      vi.spyOn(Storage.prototype, "removeItem"),
      vi.spyOn(Storage.prototype, "clear"),
      vi.spyOn(Storage.prototype, "key"),
    ];
    const pushState = vi.spyOn(history, "pushState");
    const replaceState = vi.spyOn(history, "replaceState");
    const nativeSubmit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => undefined);
    const consoleSpies = [
      vi.spyOn(console, "debug").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const initialUrl = window.location.href;
    let submissionPrevented = false;
    window.addEventListener(
      "submit",
      (event) => {
        submissionPrevented = event.defaultPrevented;
      },
      { once: true },
    );

    start();
    await pasteKeys(fixture("ed25519-a.pub"), fixture("ed25519-a"));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Check key pair" }));
    await screen.findByText("These keys match");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Wipe keys" }));

    expect(submissionPrevented).toBe(true);
    for (const spy of [
      fetchSpy,
      webSocketSpy,
      indexedDbOpen,
      xhrOpen,
      xhrSend,
      beacon,
      ...storageSpies,
      pushState,
      replaceState,
      nativeSubmit,
      requestSubmit,
      ...consoleSpies,
    ]) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(window.location.href).toBe(initialUrl);
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(document.cookie).toBe("");
  });
});
