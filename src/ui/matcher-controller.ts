import { matchKeyPair } from "../core/match-key-pair";
import { parsePrivateKey, parsePublicKey } from "../core/parse-key";
import { KeyParseError, MAX_KEY_INPUT_BYTES } from "../core/types";
import type { KeyMetadata, MatchResult } from "../core/types";

type MatchKeyPair = (
  publicKeyText: string,
  privateKeyText: string,
) => Promise<MatchResult>;

interface KeyFileTarget {
  readonly input: HTMLTextAreaElement;
  readonly picker: HTMLInputElement;
  readonly zone: HTMLElement;
  readonly error: HTMLElement;
  readonly label: string;
}

interface MatcherElements {
  readonly form: HTMLFormElement;
  readonly publicKey: HTMLTextAreaElement;
  readonly publicKeyFile: HTMLInputElement;
  readonly publicKeyDropZone: HTMLElement;
  readonly privateKey: HTMLTextAreaElement;
  readonly privateKeyFile: HTMLInputElement;
  readonly privateKeyDropZone: HTMLElement;
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
    publicKeyFile: requiredElement(pageDocument, "#public-key-file"),
    publicKeyDropZone: requiredElement(pageDocument, "#public-key-drop-zone"),
    privateKey: requiredElement(pageDocument, "#private-key"),
    privateKeyFile: requiredElement(pageDocument, "#private-key-file"),
    privateKeyDropZone: requiredElement(pageDocument, "#private-key-drop-zone"),
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
  const FileReaderConstructor = pageWindow.FileReader;

  const elements = getElements(pageDocument);
  const runMatch = options.match ?? matchKeyPair;
  let revision = 0;
  let isChecking = false;
  const resetFileTargets: Array<() => void> = [];
  const fileTargets: readonly KeyFileTarget[] = [
    {
      input: elements.publicKey,
      picker: elements.publicKeyFile,
      zone: elements.publicKeyDropZone,
      error: elements.publicError,
      label: "public key",
    },
    {
      input: elements.privateKey,
      picker: elements.privateKeyFile,
      zone: elements.privateKeyDropZone,
      error: elements.privateError,
      label: "private key",
    },
  ];

  function setStatus(message: string, tone: "error" | "info"): void {
    elements.status.textContent = message;
    elements.status.dataset["tone"] = tone;
  }

  function clearStatus(): void {
    elements.status.textContent = "";
    delete elements.status.dataset["tone"];
  }

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
        : "Add both keys to enable checking.";
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
    clearStatus();
  }

  function wipe(focusPublicKey: boolean): void {
    revision += 1;
    isChecking = false;
    elements.publicKey.value = "";
    elements.privateKey.value = "";
    for (const resetFileTarget of resetFileTargets) {
      resetFileTarget();
    }
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

  function showFileError(target: KeyFileTarget, message: string): void {
    target.input.setAttribute("aria-invalid", "true");
    target.error.textContent = message;
    target.error.hidden = false;
    setStatus(
      `Fix the highlighted ${target.label} field and try again.`,
      "error",
    );
  }

  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReaderConstructor();
      const rejectRead = (): void => {
        reject(new Error("The selected file could not be read."));
      };
      reader.addEventListener(
        "load",
        () => {
          resolve(reader.result as string);
        },
        { once: true },
      );
      reader.addEventListener("error", rejectRead, { once: true });
      reader.addEventListener("abort", rejectRead, { once: true });
      reader.readAsText(file);
    });
  }

  async function loadKeyFile(
    target: KeyFileTarget,
    files: readonly File[],
  ): Promise<void> {
    revision += 1;
    const loadRevision = revision;
    isChecking = false;
    clearFeedback();
    updateSubmitState();

    if (files.length !== 1) {
      showFileError(target, "Drop one key file at a time.");
      target.input.focus();
      return;
    }

    const file = files[0] as File;
    if (file.size > MAX_KEY_INPUT_BYTES) {
      showFileError(target, "The key file must be 64 KB or smaller.");
      target.input.focus();
      return;
    }

    setStatus(`Reading ${file.name} locally.`, "info");
    try {
      const contents = await readFile(file);
      if (revision !== loadRevision) {
        return;
      }
      target.input.value = contents;
      clearFeedback();
      updateSubmitState();
      setStatus(`${file.name} loaded into the ${target.label} field.`, "info");
      target.input.focus();
    } catch {
      if (revision !== loadRevision) {
        return;
      }
      showFileError(target, "The key file could not be read.");
      target.input.focus();
    }
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
      setStatus(
        errors.length === 1
          ? "Fix the highlighted key field and check again."
          : "Fix both highlighted key fields and check again.",
        "error",
      );
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
      elements.result.focus();
    } catch {
      if (revision !== checkRevision) {
        return;
      }
      isChecking = false;
      setStatus(
        "The keys could not be checked. Wipe them and try again.",
        "error",
      );
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

  const removeFileListeners = fileTargets.map((target) => {
    let dragDepth = 0;

    function resetFileTarget(): void {
      dragDepth = 0;
      target.zone.classList.remove("is-dragging");
      target.picker.value = "";
    }

    function hasFiles(event: DragEvent): boolean {
      const transfer = event.dataTransfer;
      if (!transfer) {
        return false;
      }
      return (
        transfer.files.length > 0 ||
        Array.from(transfer.types).includes("Files")
      );
    }

    function handleDragEnter(event: DragEvent): void {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      dragDepth += 1;
      target.zone.classList.add("is-dragging");
    }

    function handleDragOver(event: DragEvent): void {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      (event.dataTransfer as DataTransfer).dropEffect = "copy";
    }

    function handleDragLeave(event: DragEvent): void {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        target.zone.classList.remove("is-dragging");
      }
    }

    function handleDrop(event: DragEvent): void {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      dragDepth = 0;
      target.zone.classList.remove("is-dragging");
      const files = Array.from((event.dataTransfer as DataTransfer).files);
      void loadKeyFile(target, files);
    }

    function handleFileSelection(): void {
      const files = Array.from(target.picker.files as FileList);
      target.picker.value = "";
      void loadKeyFile(target, files);
    }

    target.zone.addEventListener("dragenter", handleDragEnter);
    target.zone.addEventListener("dragover", handleDragOver);
    target.zone.addEventListener("dragleave", handleDragLeave);
    target.zone.addEventListener("drop", handleDrop);
    target.picker.addEventListener("change", handleFileSelection);
    resetFileTargets.push(resetFileTarget);

    return (): void => {
      target.zone.removeEventListener("dragenter", handleDragEnter);
      target.zone.removeEventListener("dragover", handleDragOver);
      target.zone.removeEventListener("dragleave", handleDragLeave);
      target.zone.removeEventListener("drop", handleDrop);
      target.picker.removeEventListener("change", handleFileSelection);
    };
  });

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
      for (const removeListeners of removeFileListeners) {
        removeListeners();
      }
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
