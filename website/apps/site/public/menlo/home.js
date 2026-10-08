// Device hints only choose instructions; they never claim Menlo is installed.
const isMac = /Mac/i.test(navigator.userAgent) && navigator.maxTouchPoints < 2;
for (const region of document.querySelectorAll("[data-device]")) {
  region.hidden = (region.dataset.device === "mac") !== isMac;
}

// Remember only a deliberate download handoff, in this browser session.
// Returning to the listing must not silently select newer code.
const handoffKey = "menlo.app-handoff";
function savedHandoff() {
  try {
    const value = sessionStorage.getItem(handoffKey);
    if (!value) return null;
    const url = new URL(value);
    if (url.origin !== location.origin || !/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname) || !/^[a-f0-9]{40}$/.test(url.searchParams.get("commit")) || !/^[1-9]\d*$/.test(url.searchParams.get("repository"))) return null;
    return url;
  } catch { return null; }
}
for (const link of document.querySelectorAll("[data-remember-app]")) {
  link.addEventListener("click", () => {
    const url = document.querySelector("[data-app-version-url]")?.dataset.appVersionUrl;
    if (url) { try { sessionStorage.setItem(handoffKey, `${url}#get-app`); } catch {} }
  });
}
window.addEventListener("pageshow", () => {
  const saved = savedHandoff();
  if (saved && saved.pathname === location.pathname && !location.search) {
    try { sessionStorage.removeItem(handoffKey); } catch {}
    location.replace(saved.href);
  }
});
const saved = savedHandoff();
if (saved && saved.pathname !== location.pathname) {
  const resume = document.createElement("a");
  resume.className = "ml-version-notice ml-resume-app";
  resume.href = saved.href;
  resume.textContent = "Continue installing your selected app →";
  resume.addEventListener("click", () => { try { sessionStorage.removeItem(handoffKey); } catch {} });
  document.getElementById("main")?.prepend(resume);
}

for (const button of document.querySelectorAll("[data-share-url]")) {
  if (typeof navigator.share !== "function") continue;
  button.hidden = false;
  button.addEventListener("click", async () => {
    try { await navigator.share({ title: button.dataset.shareTitle, url: button.dataset.shareUrl }); }
    catch (error) {
      if (error.name === "AbortError") return;
      const status = button.closest(".ml-sheet-panel").querySelector(".ml-copy-status");
      if (status) status.textContent = "Sharing is unavailable. Copy the app link below instead.";
    }
  });
}

const sheets = new Map();
for (const details of document.querySelectorAll("[data-sheet]")) {
  if (typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) continue;
  const trigger = details.querySelector("summary");
  const panel = details.querySelector(".ml-sheet-panel");
  const dialog = document.createElement("dialog");
  dialog.className = "ml-dialog";
  dialog.setAttribute("aria-labelledby", `${details.id}-title`);
  dialog.append(panel);
  document.body.append(dialog);
  trigger.setAttribute("aria-haspopup", "dialog");
  let returnFocus = trigger;
  const open = (source = trigger) => {
    if (dialog.open) return;
    returnFocus = source;
    dialog.showModal();
    panel.querySelector("h2").focus();
  };
  trigger.addEventListener("click", event => { event.preventDefault(); open(); });
  const close = panel.querySelector("[data-close-sheet]");
  close.hidden = false;
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (location.hash === `#${details.id}`) history.replaceState(null, "", location.pathname + location.search);
    returnFocus.focus();
  });
  sheets.set(details.id, open);
}
for (const trigger of document.querySelectorAll("[data-open-sheet]")) {
  trigger.addEventListener("click", event => {
    const open = sheets.get(trigger.dataset.openSheet);
    if (open) { event.preventDefault(); open(trigger); }
  });
}
function openLinkedSheet() { sheets.get(location.hash.slice(1))?.(); }
window.addEventListener("hashchange", openLinkedSheet);
openLinkedSheet();

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copy);
    const status = button.parentElement.querySelector(".ml-copy-status");
    try {
      await navigator.clipboard.writeText(target.value ?? target.textContent);
      status.textContent = button.dataset.copyMessage ?? (button.dataset.copy === "app-link" ? "App link copied." : "Commands copied.");
    } catch {
      status.textContent = "Copying is unavailable. Select and copy the text above.";
      if (target instanceof HTMLInputElement) { target.focus(); target.select(); }
      else {
        const range = document.createRange();
        range.selectNodeContents(target);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  });
}

// Thumbnails stay ordinary image links without JavaScript.
for (const link of document.querySelectorAll("[data-preview-image]")) {
  if (typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) break;
  link.addEventListener("click", event => {
    event.preventDefault();
    const dialog = document.createElement("dialog");
    dialog.className = "ml-dialog ml-media-dialog";
    dialog.setAttribute("aria-label", link.querySelector("img").alt);
    const panel = document.createElement("div");
    panel.className = "ml-sheet-panel";
    const close = document.createElement("button");
    close.className = "ml-button ml-button-secondary";
    close.type = "button";
    close.textContent = "Close screenshot";
    const image = document.createElement("img");
    image.src = link.href;
    image.alt = link.querySelector("img").alt;
    panel.append(close, image);
    dialog.append(panel);
    document.body.append(dialog);
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { dialog.remove(); link.focus(); });
    dialog.showModal();
  });
}

for (const form of document.querySelectorAll("[data-review-form]")) {
  form.hidden = false;
  const status = form.querySelector("[data-review-status]");
  const signin = form.querySelector("[data-review-signin]");
  const signout = form.querySelector("[data-review-signout]");
  const submit = form.querySelector("[data-review-submit]");
  const withdraw = form.querySelector("[data-review-withdraw]");
  const loginPanel = form.querySelector("[data-review-login]");
  const loginURL = "/api/menlo/v1/review-login";
  const reviewURL = `/api/menlo/v1/apps/${form.dataset.slug}/reviews?commit=${form.dataset.commit}&repository=${form.dataset.repository}`;
  let reviewer = null, timer, busy = false;
  const request = async (url, method = "GET", body) => {
    const response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000), ...(method !== "GET" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) } : {}) });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || "Unable to complete this action. Please try again.");
      error.status = response.status;
      throw error;
    }
    return result;
  };
  function account(value) {
    reviewer = value;
    signin.hidden = !!value;
    signout.hidden = !value;
    submit.disabled = !value || busy;
    withdraw.hidden = true;
    form.querySelector("[data-review-account]").textContent = value ? `Publishing as @${value.login} · GitHub account #${value.id}` : "Your review is public and attached only to this version.";
    if (value) {
      loginPanel.hidden = true;
      request(reviewURL).then(result => { withdraw.hidden = !result.reviews.some(review => review.reviewer.id === value.id); }).catch(error => { status.textContent = error.message; });
    }
  }
  async function poll(interval = 5) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const result = await request(`${loginURL}/poll`, "POST");
        if (result.reviewer) { account(result.reviewer); status.textContent = "Signed in. Confirm your source review below to publish."; signin.disabled = false; }
        else await poll(result.interval ?? interval);
      } catch (error) { status.textContent = error.message; signin.disabled = false; loginPanel.hidden = true; }
    }, interval * 1000);
  }
  function loadAccount() {
    request(loginURL).then(result => {
      account(result.reviewer);
      if (!result.available && !result.reviewer) { signin.disabled = true; status.textContent = "Browser GitHub sign-in is unavailable. You can review from Terminal below."; }
    }).catch(error => { status.textContent = error.message; });
  }
  document.querySelector("#review-app > summary")?.addEventListener("click", loadAccount);
  if (location.hash === "#review-app") loadAccount();
  signin.addEventListener("click", async () => {
    signin.disabled = true;
    status.textContent = "Preparing GitHub sign-in…";
    try {
      const result = await request(loginURL, "POST");
      if (result.reviewer) { account(result.reviewer); signin.disabled = false; status.textContent = "Signed in. Confirm your source review below to publish."; return; }
      form.querySelector("[data-review-code]").textContent = result.user_code;
      loginPanel.hidden = false;
      status.textContent = "Waiting for your approval on GitHub…";
      // GitHub is opened by the person's next click; no popup or account action
      // is inferred from merely viewing an app or its review sheet.
      await poll(result.interval);
    } catch (error) { status.textContent = error.message; signin.disabled = false; }
  });
  signout.addEventListener("click", async () => {
    clearTimeout(timer);
    try { await request(loginURL, "DELETE"); account(null); signin.disabled = false; status.textContent = "Signed out."; }
    catch (error) { status.textContent = error.message; }
  });
  async function publish(outcome) {
    if (!reviewer || busy) return;
    busy = true; submit.disabled = true; withdraw.disabled = true;
    status.textContent = outcome === "withdraw" ? "Withdrawing your review…" : "Publishing your source review…";
    try {
      const result = await request(reviewURL, "POST", {
        policy: form.dataset.policy, statement: form.dataset.statement, outcome,
        repository_id: Number(form.dataset.repository), commit: form.dataset.commit,
        project: form.dataset.project, scheme: form.dataset.scheme,
        scopes: outcome === "withdraw" ? [] : ["source", ...Array.from(form.querySelectorAll('input[name="scope"]:checked:not(:disabled)'), input => input.value)],
        notes: form.elements.notes.value,
      });
      if (result.commit !== form.dataset.commit || result.repository_id !== Number(form.dataset.repository) || result.reviewer.id !== reviewer.id) throw new Error("The review response did not match this version. Check this page before trying again.");
      location.assign(`${form.dataset.versionUrl}#reviews`);
    } catch (error) {
      if (error.status === 401) { account(null); signin.disabled = false; }
      status.textContent = error.message;
    } finally { busy = false; submit.disabled = !reviewer; withdraw.disabled = false; }
  }
  form.addEventListener("submit", event => { event.preventDefault(); if (form.elements.confirm.checked) publish("recommend"); });
  withdraw.addEventListener("click", () => publish("withdraw"));
}
