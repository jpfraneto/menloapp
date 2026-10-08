import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");
const distRoot = join(projectRoot, "dist");

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function htmlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return htmlFiles(path);
      return entry.isFile() && entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return nested.flat();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const home = await readFile(join(distRoot, "index.html"), "utf8");
assert(home.includes("menloapp docs"), "docs home must use the menloapp identity");
assert(home.includes("Recipients build it on their own Mac"), "docs must lead with iOS distribution");
assert(home.includes("menloapp deploy"), "docs must teach the published CLI command");
assert(home.includes("npm i -g menloapp"), "docs must use the published npm package");
assert(home.includes("exact-version"), "docs must explain version-preserving sharing");
assert(home.includes('href="https://docs.menloapp.lol/"'), "docs home must use the Menlo canonical domain");
assert(!home.includes("docs.tohseno.com"), "docs home must not advertise the former domain");
const statusPage = await readFile(join(distRoot, "guide/reference/current-status/index.html"), "utf8");
const cliPackage = JSON.parse(await readFile(join(projectRoot, "../../packages/cli/package.json"), "utf8"));
assert(statusPage.includes(cliPackage.version), "current status must describe the current published CLI");
assert(statusPage.includes("not implemented"), "current status must disclose current notification limits");
assert(!statusPage.includes("Production Claims writes and the Claims relayer are disabled"), "retired availability snapshot must not ship");
assert(home.includes("Share an app") && home.includes("Try an app") && home.includes("Create an app"), "docs home must lead with the three useful paths");
assert(!home.includes("data-minute-player"), "the retired minute-player tutorial must not ship");
assert(!home.includes('href="/docs.css"'), "the retired tutorial stylesheet must not ship");
assert(!home.includes('src="/docs.js"'), "the retired tutorial script must not ship");

const guideFiles = (await htmlFiles(join(distRoot, "guide"))).filter((path) => path.endsWith("index.html"));
assert(guideFiles.length === 43, `expected 43 documentation pages, found ${guideFiles.length}`);
const onboarding = await readFile(join(distRoot, "guide/start/install-and-onboard/index.html"), "utf8");
assert(onboarding.includes("optional afterward"), "app-first onboarding must keep Menlo on iPhone optional");
assert(onboarding.includes("menloapp setup"), "fresh-start setup must use the current launcher");
const reviews = await readFile(join(distRoot, "guide/security/source-reviews/index.html"), "utf8");
assert(reviews.includes("no inherited reviews"), "source reviews must not inherit across versions");
assert(reviews.includes("never authorizes a recipient build"), "reviews must preserve local build consent");
const legacy = await readFile(join(distRoot, "guide/product/ship-claim-update/index.html"), "utf8");
assert(legacy.includes("Historical Registry path"), "legacy publication must be visibly scoped");
const aiCorpus = await readFile(join(distRoot, "llms-full.txt"), "utf8");
assert(aiCorpus.includes("ADR 0043") && aiCorpus.includes("ADR 0044"), "AI feed must include current onboarding and review authority");
assert(aiCorpus.includes("Source: https://docs.menloapp.lol/"), "AI feed must use the Menlo docs domain");
assert(!aiCorpus.includes("docs.tohseno.com"), "AI feed must not point back to the former domain");
assert(await exists(join(distRoot, "pagefind", "pagefind.js")), "Pagefind search index is missing");
assert(await exists(join(distRoot, "sitemap-index.xml")), "sitemap is missing");
assert(await exists(join(distRoot, "llms.txt")), "AI-readable documentation index is missing");
assert(await exists(join(distRoot, "llms-full.txt")), "AI-readable documentation corpus is missing");

assert(!(await exists(join(distRoot, "crew"))), "character portraits must not ship");

const allHtml = await htmlFiles(distRoot);
for (const file of allHtml) {
  const content = await readFile(file, "utf8");
  assert(!content.includes("guide-note") && !content.includes("/crew/") && !content.includes("data-page-ai"), `character callouts or AI panels in ${file}`);
  assert(!content.includes("github.com/jpfraneto/tohseno"), `obsolete repository URL in ${file}`);
  assert(!content.includes("menlo deploy"), `obsolete consumer command in ${file}`);
  assert(!content.includes("1.3.0-rc.1"), `obsolete preview instructions in ${file}`);
  for (const match of content.matchAll(/href="(\/[^"]*)"/g)) {
    const href = match[1].split("#", 1)[0].split("?", 1)[0];
    if (!href || href.startsWith("/_astro/") || href.startsWith("/pagefind/")) continue;
    if (/\.[a-z0-9]+$/i.test(href)) {
      assert(await exists(join(distRoot, href)), `broken asset link ${href} in ${file}`);
      continue;
    }
    const target = href === "/" ? join(distRoot, "index.html") : join(distRoot, href, "index.html");
    assert(await exists(target), `broken internal link ${href} in ${file}`);
    const fragment = match[1].split("#")[1];
    if (fragment) {
      const targetContent = await readFile(target, "utf8");
      assert(targetContent.includes(`id="${decodeURIComponent(fragment)}"`), `broken anchor ${match[1]} in ${file}`);
    }
  }
}

console.log(`Verified lightweight home, ${guideFiles.length} docs pages, AI feeds, search, sitemap, and internal links.`);
