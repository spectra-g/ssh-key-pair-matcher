import { matchKeyPair } from "../core/match-key-pair";
import { parsePrivateKey, parsePublicKey } from "../core/parse-key";
import { KeyParseError } from "../core/types";
import type { KeyMetadata, MatchResult } from "../core/types";

type MatchKeyPair = (
  publicKeyText: string,
  privateKeyText: string,
) => Promise<MatchResult>;

interface MatcherElements {
  readonly form: HTMLFormElement;
  readonly publicKey: HTMLTextAreaElement;
  readonly privateKey: HTMLTextAreaElement;
  readonly submit: HTMLButtonElement;
  readonly wipe: HTMLButtonElement;
  readonly submitHelp: HTMLElement;
  readonly status: HTMLElement;
  readonly publicError: HTMLElement;
  readonly privateError: HTMLElement;
  readonly result: HTMLElement;
  readonly resultSummary: HTMLElement;
  readonly resultDescription: HTMLElement;
  readonly publicAlgorithm: HTMLElement;
  readonly publicKeySize: HTMLElement;
  readonly publicSha256: HTMLElement;
  readonly publicMd5: HTMLElement;
  readonly privateAlgorithm: HTMLElement;
  readonly privateKeySize: HTMLElement;
  readonly privateSha256: HTMLElement;
  readonly privateMd5: HTMLElement;
  readonly privateEncrypted: HTMLElement;
}

export interface MatcherController {
  wipe(): void;
  destroy(): void;
}

export interface MatcherControllerOptions {
  readonly match?: MatchKeyPair;
}

function requiredElement<T extends Element>(
  pageDocument: Document,
  selector: string,
): T {
  const element = pageDocument.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`The matcher element "${selector}" is missing.`);
  }
  return element;
}

function getElements(pageDocument: Document): MatcherElements {
  return {
    form: requiredElement(pageDocument, "#matcher-form"),
    publicKey: requiredElement(pageDocument, "#public-key"),
    privateKey: requiredElement(pageDocument, "#private-key"),
    submit: requiredElement(pageDocument, "#check-key-pair"),
    wipe: requiredElement(pageDocument, "#wipe-keys"),
    submitHelp: requiredElement(pageDocument, "#submit-help"),
    status: requiredElement(pageDocument, "#app-status"),
    publicError: requiredElement(pageDocument, "#public-key-error"),
    privateError: requiredElement(pageDocument, "#private-key-error"),
    result: requiredElement(pageDocument, "#match-result"),
    resultSummary: requiredElement(pageDocument, "#result-summary"),
    resultDescription: requiredElement(pageDocument, "#result-description"),
    publicAlgorithm: requiredElement(pageDocument, "#public-algorithm"),
    publicKeySize: requiredElement(pageDocument, "#public-key-size"),
    publicSha256: requiredElement(pageDocument, "#public-sha256"),
    publicMd5: requiredElement(pageDocument, "#public-md5"),
    privateAlgorithm: requiredElement(pageDocument, "#private-algorithm"),
    privateKeySize: requiredElement(pageDocument, "#private-key-size"),
    privateSha256: requiredElement(pageDocument, "#private-sha256"),
    privateMd5: requiredElement(pageDocument, "#private-md5"),
    privateEncrypted: requiredElement(pageDocument, "#private-encrypted"),
  };
}

function setMetadata(
  elements: MatcherElements,
  prefix: "public" | "private",
  metadata: KeyMetadata,
): void {
  const algorithm =
    prefix === "public" ? elements.publicAlgorithm : elements.privateAlgorithm;
  const keySize =
    prefix === "public" ? elements.publicKeySize : elements.privateKeySize;
  const sha256 =
    prefix === "public" ? elements.publicSha256 : elements.privateSha256;
  const md5 = prefix === "public" ? elements.publicMd5 : elements.privateMd5;

  algorithm.textContent = metadata.algorithm;
  keySize.textContent = `${metadata.bits} bits`;
  sha256.textContent = metadata.sha256Fingerprint;
  md5.textContent = metadata.md5Fingerprint;
}

function clearText(...elements: HTMLElement[]): void {
  for (const element of elements) {
    element.textContent = "";
  }
}

export function initializeMatcher(
  pageDocument: Document,
  options: MatcherControllerOptions = {},
): MatcherController {
  const pageWindow = pageDocument.defaultView;
  if (pageWindow === null) {
    throw new Error("The matcher requires a browser window.");
  }

  const elements = getElements(pageDocument);
  const runMatch = options.match ?? matchKeyPair;
  let revision = 0;
  let isChecking = false;

  function updateSubmitState(): void {
    const hasBothKeys =
      elements.publicKey.value.trim().length > 0 &&
      elements.privateKey.value.trim().length > 0;
    elements.submit.disabled = !hasBothKeys || isChecking;
    elements.form.setAttribute("aria-busy", String(isChecking));
    elements.submitHelp.textContent = isChecking
      ? "Checking locally in this browser."
      : hasBothKeys
        ? "Ready to check locally. No keys will be uploaded."
        : "Paste both keys to enable checking.";
  }

  function clearErrors(): void {
    for (const [input, error] of [
      [elements.publicKey, elements.publicError],
      [elements.privateKey, elements.privateError],
    ] as const) {
      input.setAttribute("aria-invalid", "false");
      error.textContent = "";
      error.hidden = true;
    }
  }

  function clearResult(): void {
    elements.result.hidden = true;
    elements.result.className = "result";
    elements.form.removeAttribute("data-result");
    clearText(
      elements.resultSummary,
      elements.resultDescription,
      elements.publicAlgorithm,
      elements.publicKeySize,
      elements.publicSha256,
      elements.publicMd5,
      elements.privateAlgorithm,
      elements.privateKeySize,
      elements.privateSha256,
      elements.privateMd5,
      elements.privateEncrypted,
    );
  }

  function clearFeedback(): void {
    clearErrors();
    clearResult();
    elements.status.textContent = "";
  }

  function wipe(focusPublicKey: boolean): void {
    revision += 1;
    isChecking = false;
    elements.publicKey.value = "";
    elements.privateKey.value = "";
    clearFeedback();
    updateSubmitState();
    if (focusPublicKey) {
      elements.publicKey.focus();
    }
  }

  function showFieldError(error: KeyParseError): void {
    const input =
      error.field === "public" ? elements.publicKey : elements.privateKey;
    const message =
      error.field === "public" ? elements.publicError : elements.privateError;
    input.setAttribute("aria-invalid", "true");
    message.textContent = error.message;
    message.hidden = false;
  }

  function validateFields(
    publicKeyText: string,
    privateKeyText: string,
  ): KeyParseError[] {
    const errors: KeyParseError[] = [];
    try {
      parsePublicKey(publicKeyText);
    } catch (error) {
      errors.push(error as KeyParseError);
    }
    try {
      parsePrivateKey(privateKeyText);
    } catch (error) {
      errors.push(error as KeyParseError);
    }
    return errors;
  }

  function renderResult(result: MatchResult): void {
    const state = result.matches ? "match" : "no-match";
    elements.resultSummary.textContent = result.matches
      ? "These keys match"
      : "These keys do not match";
    elements.resultDescription.textContent = result.matches
      ? "The public component in the private key is identical to the pasted public key."
      : "The two keys have different public components.";
    setMetadata(elements, "public", result.publicKey);
    setMetadata(elements, "private", result.privateKey);
    elements.privateEncrypted.textContent = result.privateKey.isEncrypted
      ? "Yes"
      : "No";
    elements.result.classList.add(`result--${state}`);
    elements.form.dataset["result"] = state;
    elements.result.hidden = false;
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    revision += 1;
    const checkRevision = revision;
    clearFeedback();

    const publicKeyText = elements.publicKey.value;
    const privateKeyText = elements.privateKey.value;
    const errors = validateFields(publicKeyText, privateKeyText);
    if (errors.length > 0) {
      for (const error of errors) {
        showFieldError(error);
      }
      elements.status.textContent =
        errors.length === 1
          ? "Fix the highlighted key field and check again."
          : "Fix both highlighted key fields and check again.";
      const firstError = errors[0] as KeyParseError;
      (firstError.field === "public"
        ? elements.publicKey
        : elements.privateKey
      ).focus();
      updateSubmitState();
      return;
    }

    isChecking = true;
    updateSubmitState();
    try {
      const result = await runMatch(publicKeyText, privateKeyText);
      if (revision !== checkRevision) {
        return;
      }
      isChecking = false;
      renderResult(result);
      updateSubmitState();
    } catch {
      if (revision !== checkRevision) {
        return;
      }
      isChecking = false;
      elements.status.textContent =
        "The keys could not be checked. Wipe them and try again.";
      updateSubmitState();
    }
  }

  function handleInput(): void {
    revision += 1;
    isChecking = false;
    clearFeedback();
    updateSubmitState();
  }

  function handleWipe(): void {
    wipe(true);
  }

  function handlePageHide(): void {
    wipe(false);
  }

  function handlePageShow(event: PageTransitionEvent): void {
    if (event.persisted) {
      wipe(true);
    }
  }

  function handleFormSubmit(event: SubmitEvent): void {
    void handleSubmit(event);
  }

  elements.form.addEventListener("submit", handleFormSubmit);
  elements.publicKey.addEventListener("input", handleInput);
  elements.privateKey.addEventListener("input", handleInput);
  elements.wipe.addEventListener("click", handleWipe);
  pageWindow.addEventListener("pagehide", handlePageHide);
  pageWindow.addEventListener("pageshow", handlePageShow);

  wipe(true);

  return {
    wipe: handleWipe,
    destroy(): void {
      elements.form.removeEventListener("submit", handleFormSubmit);
      elements.publicKey.removeEventListener("input", handleInput);
      elements.privateKey.removeEventListener("input", handleInput);
      elements.wipe.removeEventListener("click", handleWipe);
      pageWindow.removeEventListener("pagehide", handlePageHide);
      pageWindow.removeEventListener("pageshow", handlePageShow);
      wipe(false);
    },
  };
}
