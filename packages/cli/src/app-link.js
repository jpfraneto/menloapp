const SHA = /^[a-f0-9]{40}$/;

/** Parse only MENLO app links. Version parameters are never silently discarded. */
export function parseAppLink(value) {
  let slug = value, commit = null, repositoryID = null;
  if (value.startsWith("https://")) {
    const url = new URL(value);
    if (url.origin !== "https://menloapp.lol" || url.username || url.password || (url.hash && !["#get-app", "#reviews"].includes(url.hash))) throw new Error("Use a menloapp.lol app link.");
    for (const key of url.searchParams.keys()) {
      if (!["commit", "repository"].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error("Use a MENLO app link with one exact version.");
    }
    commit = url.searchParams.get("commit");
    repositoryID = url.searchParams.get("repository");
    if (commit !== null && !SHA.test(commit)) throw new Error("An app version needs the full Git commit.");
    if (repositoryID !== null && (!commit || !/^[1-9]\d*$/.test(repositoryID) || !Number.isSafeInteger(Number(repositoryID)))) throw new Error("Invalid app repository identity.");
    slug = url.pathname.replace(/^\/|\/$/g, "");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 64) throw new Error("Use https://menloapp.lol/your-app");
  return { slug, commit, repositoryID };
}
