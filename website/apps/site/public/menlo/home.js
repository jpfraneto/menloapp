// Device hints only choose instructions; they never claim Menlo is installed.
const isMac = /Mac/i.test(navigator.userAgent) && navigator.maxTouchPoints < 2;
for (const region of document.querySelectorAll("[data-device]")) {
  region.hidden = (region.dataset.device === "mac") !== isMac;
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
