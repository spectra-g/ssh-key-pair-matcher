import { initializeMatcher } from "./ui/matcher-controller";
import type { MatcherController } from "./ui/matcher-controller";
import { initializeTheme } from "./ui/theme-controller";

export function initializePage(pageDocument: Document): MatcherController {
  const matcher = initializeMatcher(pageDocument);
  const theme = initializeTheme(pageDocument);

  return {
    wipe(): void {
      matcher.wipe();
    },
    destroy(): void {
      theme.destroy();
      matcher.destroy();
    },
  };
}
