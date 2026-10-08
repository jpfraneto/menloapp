import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const projectRoot = join(import.meta.dirname, "..");
const sourceRoot = join(projectRoot, "..", "apps", "site", "public");
const publicRoot = join(projectRoot, "public");
const docsRoot = join(projectRoot, "src", "content", "docs");

async function markdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.isFile() && /\.mdx?$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

function frontmatterValue(source: string, key: string): string {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
}

function routeForFile(path: string): string {
  const route = relative(docsRoot, path)
    .split(sep)
    .join("/")
    .replace(/\.mdx?$/, "")
    .replace(/(^|\/)index$/, "$1");
  return `/${route}`.replace(/\/+$/, "/");
}

const docs = await Promise.all(
  (await markdownFiles(docsRoot)).map(async (path) => {
    const source = await readFile(path, "utf8");
    return {
      title: frontmatterValue(source, "title") || routeForFile(path),
      description: frontmatterValue(source, "description"),
      route: routeForFile(path),
      body: source.replace(/^---\n[\s\S]*?\n---\n?/, "").trim(),
    };
  }),
);

const llmsIndex = [
  "# Menlo documentation",
  "",
  "> Menlo distributes public GitHub iOS apps with menloapp deploy and menloapp try. Share an exact-version link; the recipient reviews source and builds/signs on their own Mac for their intended iPhone. ADR 0040 defines GitHub distribution, ADR 0043 defines app-first versus fresh-start setup, and ADR 0044 defines version links and non-inheriting GitHub source reviews. The directory is centralized. Registry, Ship, and Claim pages describe the retained legacy path.",
  "",
  "This index is generated from the same public Markdown used by the human-readable site.",
  "For a single model-ready corpus, use https://docs.menloapp.lol/llms-full.txt.",
  "",
  "## Pages",
  "",
  ...docs.map(
    ({ title, description, route }) =>
      `- [${title}](https://docs.menloapp.lol${route})${description ? `: ${description}` : ""}`,
  ),
  "",
].join("\n");

const llmsFull = "# Current distribution authority\n\nADR 0040: Menlo uses GitHub identity, public repositories, and an off-chain directory. Install with npm i -g menloapp; share with menloapp deploy; receive with menloapp try <link>. ADR 0043: fresh-start setup installs and pairs Menlo on iPhone; trying a linked app installs that app first, with Menlo on iPhone optional afterward. ADR 0044: exact-version links preserve the full commit and numeric repository ID; GitHub source recommendations bind one commit/build recipe and never inherit or replace recipient consent. The recipient Mac builds and signs for the intended iPhone. No gas, Claim, or Companion publication approval is required on this path. Start with /guide/start/share-an-app/ or /guide/start/install-and-onboard/. Registry, Ship, and Claim material below describes the retained legacy system.\n\n" + docs
  .map(
    ({ title, route, body }) =>
      `# ${title}\n\nSource: https://docs.menloapp.lol${route}\n\n${body}\n`,
  )
  .join("\n---\n\n");

await mkdir(publicRoot, { recursive: true });
await rm(join(publicRoot, "fonts"), { recursive: true, force: true });
await rm(join(publicRoot, "modules"), { recursive: true, force: true });
await rm(join(publicRoot, "docs.css"), { force: true });
await rm(join(publicRoot, "docs.js"), { force: true });

await Promise.all([
  cp(join(sourceRoot, "favicon.png"), join(publicRoot, "favicon.png")),
  cp(join(sourceRoot, "fonts"), join(publicRoot, "fonts"), { recursive: true }),
  mkdir(join(publicRoot, "modules"), { recursive: true }).then(() =>
    cp(
      join(sourceRoot, "modules", "obsolete-worker-cleanup.js"),
      join(publicRoot, "modules", "obsolete-worker-cleanup.js"),
    ),
  ),
  writeFile(
    join(publicRoot, "_headers"),
    [
      "/*",
      "  X-Content-Type-Options: nosniff",
      "  Referrer-Policy: no-referrer",
      "  Cross-Origin-Opener-Policy: same-origin",
      "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
      "  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https://menloapp.lol data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "",
      "/_astro/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
      "/pagefind/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
      "/llms*.txt",
      "  Content-Type: text/plain; charset=utf-8",
      "  Cache-Control: public, max-age=300",
      "",
    ].join("\n"),
  ),
  writeFile(join(publicRoot, "llms.txt"), llmsIndex),
  writeFile(join(publicRoot, "llms-full.txt"), llmsFull),
  writeFile(
    join(publicRoot, "_redirects"),
    ["/docs / 308", "/docs/* /guide/:splat 308", ""].join("\n"),
  ),
]);
