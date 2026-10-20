import { sdk } from "@farcaster/miniapp-sdk";

const api = "/api/menlo/v1/farcaster";
const guestKey = "menlo.saved-apps.v1", signedOutKey = "menlo.farcaster.signed-out";
const page = document.querySelector("[data-farcaster-account]");
const select = name => page?.querySelector(`[data-farcaster-${name}]`);
let fid = null, bearer = null, inMiniApp = false, generation = 0, busy = false;
const wallets = new Map();
window.addEventListener("eip6963:announceProvider", event => {
  const { info, provider } = event.detail ?? {};
  if (typeof info?.uuid === "string" && typeof info?.name === "string" && typeof provider?.request === "function") wallets.set(info.uuid, { name: info.name.slice(0, 80), provider });
});
window.dispatchEvent(new Event("eip6963:requestProvider"));
function status(message) { if (select("status")) select("status").textContent = message; }
function storageGet(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function signedOut(value) { try { value ? sessionStorage.setItem(signedOutKey, "1") : sessionStorage.removeItem(signedOutKey); } catch {} }
function validApp(app) {
  if (!app || typeof app.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.slug) || !Number.isSafeInteger(app.repository_id) || app.repository_id <= 0 || !/^[a-f0-9]{40}$/.test(app.commit) || typeof app.name !== "string" || app.name.length > 160) return false;
  try {
    const url = new URL(app.url, location.origin);
    return url.origin === location.origin && url.pathname === `/${app.slug}` && url.searchParams.get("commit") === app.commit && url.searchParams.get("repository") === String(app.repository_id) && !url.hash;
  } catch { return false; }
}
function guestApps() {
  try {
    const value = JSON.parse(localStorage.getItem(guestKey) || "[]");
    return Array.isArray(value) ? value.slice(0, 100).filter(validApp) : [];
  } catch { return []; }
}
function storeGuests(apps) {
  try { localStorage.setItem(guestKey, JSON.stringify(apps)); }
  catch { throw new Error("This browser could not save the app. Sign in to save it to your account."); }
}
async function request(path, method = "GET", body, authenticated = true) {
  if (authenticated && bearer && inMiniApp) bearer = (await sdk.quickAuth.getToken()).token;
  const response = await fetch(`${api}${path}`, { method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000), headers: {
    ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    ...(authenticated && bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  }, ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}) });
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && authenticated) { fid = null; bearer = null; paintIdentity(); }
    throw new Error(value.error || "Unable to complete this action. Please try again.");
  }
  return value;
}
function paintIdentity() {
  document.querySelectorAll("[data-farcaster-nav]").forEach(link => { link.textContent = fid ? `Farcaster #${fid}` : "Sign in"; });
  if (!page) return;
  select("identity").textContent = fid ? `Signed in · Farcaster #${fid}` : "Browsing as a guest";
  select("signin").hidden = !!fid;
  select("signout").hidden = !fid;
  const guests = guestApps();
  select("merge").hidden = !fid || !guests.length;
  select("merge").textContent = `Add ${guests.length} guest ${guests.length === 1 ? "save" : "saves"} to my account`;
}
async function library() {
  if (!page) return;
  const account = fid, apps = fid ? (await request("/saved-apps")).apps : guestApps();
  if (account !== fid) return;
  const list = select("library");
  list.replaceChildren();
  for (const app of apps.filter(validApp)) {
    const item = document.createElement("li"), link = document.createElement("a"), detail = document.createElement("p"), remove = document.createElement("button");
    link.href = app.url; link.textContent = app.name;
    detail.className = "ml-small"; detail.textContent = `Saved version · ${app.commit.slice(0, 7)}`;
    remove.type = "button"; remove.className = "ml-text-link"; remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        if (fid) await request("/saved-apps", "DELETE", { repository_id: app.repository_id });
        else storeGuests(guestApps().filter(value => value.repository_id !== app.repository_id));
        await library(); paintIdentity();
      } catch (error) { status(error.message); remove.disabled = false; }
    });
    item.append(link, detail, remove); list.append(item);
  }
  if (!apps.length) {
    const empty = document.createElement("li");
    empty.textContent = "No saved apps yet. Open an app and choose Save app.";
    list.append(empty);
  }
}
async function completed(value) {
  generation++;
  fid = value.fid; signedOut(false);
  if (select("wallets")) select("wallets").hidden = true;
  paintIdentity(); await library();
  const target = new URLSearchParams(location.search).get("returnTo");
  if (location.pathname === "/login" && target?.startsWith("/") && !target.startsWith("//") && !target.includes("\\")) {
    const destination = new URL(target, location.origin);
    if (destination.origin === location.origin && !["/login", "/logout"].includes(destination.pathname)) location.replace(destination.href);
  }
}
async function walletSignIn(provider) {
  if (busy) return;
  busy = true;
  select("signin").disabled = true;
  select("wallets").hidden = true;
  const current = ++generation;
  let challenged = false;
  try {
    status("Connect your Farcaster custody or auth wallet…");
    const addresses = await provider.request({ method: "eth_requestAccounts" });
    if (current !== generation) return;
    const address = addresses?.[0];
    if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("The wallet did not provide an Ethereum address.");
    const hint = select("fid")?.value.trim();
    const result = await request("/login", "POST", { address, ...(hint ? { fid: Number(hint) } : {}) }, false);
    challenged = true;
    if (current !== generation) return;
    status("Sign the Menlo login message in your wallet. No gas or payment.");
    const bytes = new TextEncoder().encode(result.message);
    const encoded = "0x" + Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    const signature = await provider.request({ method: "personal_sign", params: [encoded, address] });
    if (current !== generation) return;
    status("Verifying your Farcaster identity…");
    const verified = await request("/verify", "POST", { message: result.message, signature }, false);
    if (current !== generation) return;
    await completed(verified);
    status("Signed in. Your saved apps are available here.");
  } catch (error) {
    if (challenged) await request("/logout", "POST", {}, false).catch(() => {});
    status(error.code === 4001 ? "Login signature cancelled. You can keep browsing." : error.message);
  } finally { busy = false; select("signin").disabled = false; }
}
select("signin")?.addEventListener("click", async () => {
  if (inMiniApp) {
    try {
      bearer = (await sdk.quickAuth.getToken()).token;
      await completed(await request("/session"));
      status("Signed in. Your saved apps are available here.");
    } catch (error) { status(error.message); }
    return;
  }
  if (wallets.size > 1) {
    const list = select("wallet-options");
    list.replaceChildren();
    for (const wallet of wallets.values()) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "ml-button ml-button-secondary"; button.textContent = wallet.name;
      button.addEventListener("click", () => walletSignIn(wallet.provider));
      list.append(button);
    }
    select("wallets").hidden = false;
    status("Choose the wallet that controls your Farcaster identity.");
  } else {
    const provider = wallets.values().next().value?.provider ?? window.ethereum;
    if (!provider?.request) { status("No wallet is available in this browser. Open Menlo in your wallet's browser, or connect using a wallet extension."); return; }
    await walletSignIn(provider);
  }
});
async function logout() {
  generation++;
  await request("/logout", "POST", {}, false);
  bearer = null; fid = null; signedOut(true);
  select("wallets").hidden = true; select("signin").disabled = false;
  paintIdentity(); await library();
}
select("signout")?.addEventListener("click", () => logout().then(() => status("Signed out. Your account's saved apps remain private.")).catch(error => status(error.message)));
select("merge")?.addEventListener("click", async () => {
  if (busy || !fid) return;
  busy = true; select("merge").disabled = true;
  try {
    const account = fid;
    for (const app of guestApps()) {
      if (fid !== account) throw new Error("Your account changed. Review your guest saves before continuing.");
      await request("/saved-apps", "POST", app);
      storeGuests(guestApps().filter(value => value.repository_id !== app.repository_id));
    }
    await library(); status("Guest saves added to your account.");
  } catch (error) { status(error.message); }
  finally { busy = false; select("merge").disabled = false; paintIdentity(); }
});
for (const button of document.querySelectorAll("[data-save-app]")) {
  button.hidden = false;
  button.disabled = true;
  button.addEventListener("click", async () => {
    button.disabled = true;
    const feedback = button.parentElement.querySelector("[data-save-status]");
    try {
      const url = new URL(button.dataset.saveApp), app = { slug: url.pathname.slice(1), repository_id: Number(url.searchParams.get("repository")), commit: url.searchParams.get("commit"), name: button.dataset.appName, url: url.href };
      if (!validApp(app)) throw new Error("Open the app listing again to save this version.");
      if (fid) await request("/saved-apps", "POST", app);
      else {
        const apps = guestApps().filter(value => value.repository_id !== app.repository_id);
        if (apps.length >= 100) throw new Error("Remove a saved app before adding another.");
        storeGuests([app, ...apps]);
      }
      button.textContent = "Saved";
      feedback.textContent = fid ? "Saved to your account." : "Saved in this browser. Sign in to keep it across devices.";
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

// Never trust sdk.context.user as authentication. Only the server-verified token identifies a user.
try {
  inMiniApp = await sdk.isInMiniApp();
  if (inMiniApp) {
    // Reveal the useful public page even if authentication is cancelled or unavailable.
    sdk.actions.ready().catch(() => {});
    const context = await sdk.context;
    const inset = context.client?.safeAreaInsets;
    if (inset) for (const side of ["top", "right", "bottom", "left"]) document.documentElement.style.setProperty(`--fc-inset-${side}`, `${Math.max(0, Math.min(100, Number(inset[side]) || 0))}px`);
  }
  if (inMiniApp && !storageGet(signedOutKey)) bearer = (await sdk.quickAuth.getToken()).token;
  const value = await request("/session");
  fid = value.fid;
  paintIdentity(); await library();
  if (!value.available) {
    status("Account sign-in is temporarily unavailable. Guest saves still work in this browser.");
    if (select("signin")) select("signin").disabled = true;
  }
} catch (error) {
  fid = null; bearer = null; paintIdentity(); await library();
  status(error.message);
}
for (const button of document.querySelectorAll("[data-save-app]")) button.disabled = false;
if (!["/login", "/library"].includes(location.pathname)) document.querySelectorAll("[data-farcaster-nav]").forEach(link => {
  link.href = `/login?${new URLSearchParams({ returnTo: location.pathname + location.search })}`;
});
window.addEventListener("pagehide", () => { generation++; });
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
