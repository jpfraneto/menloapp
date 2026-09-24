import { NPM_CLI_VERSION } from "./constants.js";

export const HELP = `MENLO · menloapp ${NPM_CLI_VERSION}

  menloapp                  Set up Menlo on your iPhone.
  menloapp setup            Continue iPhone setup.
  menloapp deploy [path]     Share your app. Get a live URL.
  menloapp try <link>        Install an app on your iPhone.

  menloapp init [path]       Edit your app page before deploying
  menloapp open              Open MENLO on your Mac
  menloapp doctor            Check this Mac
  menloapp --version         Print the installed version

Run menloapp deploy --help for advanced options.`;

export const GUIDE = `Start from scratch:
  menloapp
  Your Mac installs Menlo on your iPhone so you can send intents from there.

Share your app:
  menloapp deploy

Try an app:
  menloapp try https://menloapp.lol/hello-menlo
  The linked app installs first. Menlo on iPhone is optional afterward.

Discover apps at https://menloapp.lol`;

export function tryArguments(args) {
  if (!args.length || args.includes("--help") || args.includes("-h")) return null;
  let slug = args[0];
  if (slug.startsWith("https://")) {
    const url = new URL(slug);
    if (url.origin !== "https://menloapp.lol" || url.username || url.password || url.search || url.hash) throw new Error("Use a menloapp.lol app link.");
    slug = url.pathname.replace(/^\/|\/$/g, "");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 64) throw new Error("Use menloapp try https://menloapp.lol/your-app");
  return ["github", "install", slug, ...args.slice(1)];
}

export function suggestedCommand(value) {
  if (!value || value === "deploy") return null;
  const target = "deploy";
  if (Math.abs(value.length - target.length) > 1) return null;
  for (let i = 0; i < Math.max(value.length, target.length); i++) {
    if (value[i] === target[i]) continue;
    if (value.slice(i + 1) === target.slice(i + 1) || value.slice(i + 1) === target.slice(i) || value.slice(i) === target.slice(i + 1)) return target;
    if (value[i] === target[i + 1] && value[i + 1] === target[i] && value.slice(i + 2) === target.slice(i + 2)) return target;
    return null;
  }
  return null;
}

export function parseCommand(args) {
  if (!args.length || (args.length === 1 && args[0] === "setup")) return { kind: "start", args: [] };
  if (args.length === 1 && args[0] === "guide") return { kind: "guide", args: [] };
  if (args.length === 1 && ["--help", "-h", "help"].includes(args[0])) return { kind: "help", args: [] };
  if (args.length === 1 && ["--version", "-V"].includes(args[0])) return { kind: "version", args: [] };
  if (args.length === 1 && ["open", "doctor"].includes(args[0])) return { kind: args[0], args: [] };
  return { kind: "delegate", args };
}

export function redact(message) {
  return String(message)
    .replace(/([?&](?:token|claim|nonce|secret|key)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, "[redacted]")
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, "[redacted]");
}
