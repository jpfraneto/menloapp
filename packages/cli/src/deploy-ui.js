import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import process from "node:process";

export function shellQuote(value) {
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

export function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

function ask(question) {
  return new Promise((resolve, reject) => {
    const reader = createInterface({ input: process.stdin, output: process.stderr });
    let answered = false;
    reader.on("close", () => { if (!answered) reject(new Error("Deploy cancelled. Run menlo deploy when you are ready.")); });
    reader.on("SIGINT", () => reader.close());
    reader.question(question, answer => { answered = true; reader.close(); resolve(answer.trim()); });
  });
}

export function deployUI(options) {
  return {
    interactive: !options.json && !options.dryRun && process.env.MENLO_NONINTERACTIVE !== "1" && Boolean(process.stdin.isTTY && process.stderr.isTTY),
    log: options.json || options.dryRun ? () => {} : text => console.error(text),
    print: text => console.log(text), ask, open: openBrowser,
  };
}

export async function choose(ui, title, values, flag) {
  if (values.length === 1) return values[0];
  const choices = values.map((value, i) => `  ${i + 1}. ${value}`).join("\n");
  if (!ui.interactive) throw new Error(`${title}\n${choices}\n\nRun menlo deploy in a terminal to choose, or use ${flag} ${shellQuote(values[0])}.`);
  ui.log(`\n${title}\n${choices}`);
  while (true) {
    const answer = await ui.ask(`Choose 1–${values.length}: `);
    if (/^[1-9]\d*$/.test(answer) && Number(answer) <= values.length) return values[Number(answer) - 1];
    ui.log(`Enter a number from 1 to ${values.length}.`);
  }
}

export async function continueAfter(ui, message, question = "After fixing this, press Enter to continue (Ctrl+C to cancel): ") {
  if (!ui.interactive) throw new Error(`${message}\n\nThen run menlo deploy again.`);
  ui.log(`\n${message}`);
  await ui.ask(question);
}
