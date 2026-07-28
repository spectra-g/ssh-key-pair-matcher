type Theme = "light" | "dark";

export interface ThemeController {
  destroy(): void;
}

export interface ThemeControllerOptions {
  readonly mediaQuery?: MediaQueryList;
}

function requiredButton(
  pageDocument: Document,
  selector: string,
): HTMLButtonElement {
  const button = pageDocument.querySelector<HTMLButtonElement>(selector);
  if (button === null) {
    throw new Error(`The theme element "${selector}" is missing.`);
  }
  return button;
}

function oppositeTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

function actionLabel(theme: Theme): string {
  return `Switch to ${oppositeTheme(theme)} theme`;
}

export function initializeTheme(
  pageDocument: Document,
  options: ThemeControllerOptions = {},
): ThemeController {
  const pageWindow = pageDocument.defaultView;
  if (pageWindow === null) {
    throw new Error("The theme control requires a browser window.");
  }

  const root = pageDocument.documentElement;
  const toggle = requiredButton(pageDocument, "#theme-toggle");
  const mediaQuery =
    options.mediaQuery ?? pageWindow.matchMedia("(prefers-color-scheme: dark)");
  let manualTheme: Theme | null = null;

  function systemTheme(): Theme {
    return mediaQuery.matches ? "dark" : "light";
  }

  function effectiveTheme(): Theme {
    return manualTheme ?? systemTheme();
  }

  function updateLabel(): void {
    toggle.setAttribute("aria-label", actionLabel(effectiveTheme()));
  }

  function handleToggle(): void {
    manualTheme = oppositeTheme(effectiveTheme());
    root.dataset["theme"] = manualTheme;
    updateLabel();
  }

  function handleSystemChange(): void {
    if (manualTheme === null) {
      updateLabel();
    }
  }

  root.removeAttribute("data-theme");
  updateLabel();
  toggle.addEventListener("click", handleToggle);
  mediaQuery.addEventListener("change", handleSystemChange);

  return {
    destroy(): void {
      toggle.removeEventListener("click", handleToggle);
      mediaQuery.removeEventListener("change", handleSystemChange);
      manualTheme = null;
      root.removeAttribute("data-theme");
      updateLabel();
    },
  };
}
