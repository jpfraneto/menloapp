import { delegate } from "./native.js";

export function startProduct(run = delegate, write = console.log) {
  write("Welcome to Menlo. First, we’ll install Menlo on your iPhone.");
  write("You’ll send intents from your iPhone. This Mac builds and signs the apps you ask for.");
  write("Connect your iPhone and keep it unlocked. We’ll check Xcode, your Apple signing, installation, and the private connection.");
  const service = run(["service", "install"]);
  if (service !== 0) return service;
  const setup = run(["companion", "install"]);
  if (setup !== 0) {
    write("Setup is not complete. Follow the step above, then run menloapp setup to continue.");
    return setup;
  }
  write("Menlo is installed and connected. Open it on your iPhone and tap the Menlo button to send your first intent.");
  return 0;
}

export function openProduct(run = delegate, write = console.log) {
  const service = run(["service", "install"]);
  if (service !== 0) return service;
  write("Opening Menlo on your Mac…");
  return run(["studio"]);
}
