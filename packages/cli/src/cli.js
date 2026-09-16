import { NPM_CLI_VERSION } from "./constants.js";

export const HELP = `MENLO (tohseno ${NPM_CLI_VERSION})

Usage:
  tohseno deploy [path]   Connect a public GitHub app and get a shareable link
  menlo deploy [path]     The same command, with MENLO's name
  tohseno github install <slug>   Build a GitHub app for your iPhone
  tohseno init [path]     Connect local source to your Mac workshop
  tohseno open            Open MENLO on your Mac
  tohseno doctor          Check this Mac
  tohseno --version       Print the npm CLI version

Commit and push your app, then deploy once. Its link follows GitHub's default
branch. No Companion setup, native runtime download, or gas is needed to deploy.
Testers use Xcode and their own Apple signing identity on their Mac.`;

export const GUIDE = `MENLO CLI ${NPM_CLI_VERSION} is installed.

From your app's public GitHub repository:
  cd /path/to/YourApp
  tohseno deploy

Share the link. Keep pushing code. Your testers choose when to update.
Use --scheme <name> if the app has multiple Xcode schemes.`;

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
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, "[redacted]");
}
