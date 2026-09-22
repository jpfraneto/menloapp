import { discoveryDescription, discoveryHeading, menloPage } from "./menlo-shell.ts";

/** Historical Registry home uses the same identity while retaining its events. */
export function menloHome(apps: string, activity: string, status: string): string {
  return menloPage("Discover apps", discoveryDescription, "/", `<main id="main" class="ml-container ml-discovery">${discoveryHeading()}<div class="ml-app-grid">${apps}</div>${activity ? `<details class="ml-technical"><summary>Release activity</summary>${activity}</details>` : ""}<p class="ml-small">${status}</p></main>`);
}
