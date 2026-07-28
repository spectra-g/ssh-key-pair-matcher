export function initializePage(pageDocument: Document): void {
  const status = pageDocument.querySelector<HTMLElement>("#app-status");

  if (status === null) {
    throw new Error("The page status element is missing.");
  }

  status.dataset["enhanced"] = "true";
}
