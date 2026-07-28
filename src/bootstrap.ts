import { initializeMatcher } from "./ui/matcher-controller";
import type { MatcherController } from "./ui/matcher-controller";

export function initializePage(pageDocument: Document): MatcherController {
  return initializeMatcher(pageDocument);
}
