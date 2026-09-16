import { NPM_CLI_VERSION } from "./constants.js";

export const HELP = `MENLO (menloapp ${NPM_CLI_VERSION})

Usage:
  menloapp init [path]            Create your public app metadata folder
  menloapp deploy [path]          Connect a public GitHub app and get its link
  menloapp deploy --record        Record the app in Simulator for review
  menloapp github install <slug>  Build a GitHub app for your iPhone
  menloapp open                   Open MENLO on your Mac
  menloapp doctor                 Check this Mac
  menloapp --version              Print the npm CLI version

Commit and push your app and menloapp/ assets, then deploy. Its link follows
GitHub's default branch. Testers use Xcode and their own Apple signing identity.`;

export const GUIDE = `MENLO CLI ${NPM_CLI_VERSION} is installed.

From your app's public GitHub repository:
  cd /path/to/YourApp
  menloapp init
  # Edit menloapp/app.json, then commit and push.
  menloapp deploy

Share the link. Keep pushing code. Your testers choose when to update.
Deploy guides you through GitHub sign-in and choosing an app if needed.`;

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
  if (!args.length) return { kind: "guide", args: [] };
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
