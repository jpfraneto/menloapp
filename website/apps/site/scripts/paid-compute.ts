/** Run with Bun. This lab identity is separate from the native Mac identity. */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const directory = resolve(process.env.MENLOAPP_PAYMENT_STATE ?? join(homedir(), ".menloapp-payment-lab"));
const origin = new URL(process.env.MENLOAPP_PAYMENT_ORIGIN ?? "http://127.0.0.1:3000");
if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
    || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname)))) {
  throw new Error("Use an HTTPS service origin or loopback HTTP for the local lab");
}
const [command, ...args] = process.argv.slice(2);
const keyPath = join(directory, "identity.pkcs8");

function canonical(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

async function envelope(action: string, request: unknown) {
  const metadata = await lstat(keyPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("The lab identity must be a private regular file; run init first");
  }
  const key = createPrivateKey({ key: await readFile(keyPath), format: "der", type: "pkcs8" });
  const publicKey = (createPublicKey(key).export({ format: "der", type: "spki" }) as Buffer).subarray(-32);
  const binding = createHash("sha256").update("tohseno.managed.installation.v1\0").update(publicKey).digest("base64url");
  const now = Date.now();
  const payload = canonical({ schema: "tohseno.private-managed-claim/1", claim_id: `claim_${crypto.randomUUID()}`,
    installation_binding: binding, signing_public_key_base64url: publicKey.toString("base64url"), action,
    request_digest: createHash("sha256").update(canonical(request)).digest("base64url"),
    issued_at: new Date(now).toISOString(), expires_at: new Date(now + 4 * 60_000).toISOString() });
  return { request, claim: { schema: "tohseno.private-managed-claim-envelope/1",
    payload_base64url: Buffer.from(payload).toString("base64url"),
    signature_base64url: sign(null, Buffer.concat([Buffer.from("tohseno.managed.claim.v1\0"), Buffer.from(payload)]), key).toString("base64url") } };
}

async function call(path: string, request: unknown) {
  const body = await envelope(path.replaceAll("/", "_"), request);
  const response = await fetch(new URL(`/api/managed/v1/${path}`, origin), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "error",
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `Service returned HTTP ${response.status}`);
  return value;
}

function print(value: unknown) { console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2)); }
function quote(value: string) { return `'${value.replaceAll("'", "'\\''")}'`; }

if (command === "init") {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("The identity directory must not be a symlink");
  const keys = generateKeyPairSync("ed25519");
  await writeFile(keyPath, keys.privateKey.export({ format: "der", type: "pkcs8" }), { mode: 0o600, flag: "wx" });
  print("Lab identity created. Keep this directory to retain access to its balance.");
} else if (command === "balance") {
  print(await call("balance", {}));
} else if (command === "models") {
  print(await call("catalog", {}));
} else if (command === "checkout") {
  const result = await call("checkout", { pack_id: args[0] ?? "usd_10" });
  print(`Open Stripe Checkout to review and pay:\n${result.checkout_url}`);
} else if (command === "tempo") {
  const body = await envelope("checkout_mpp", { pack_id: args[0] ?? "usd_10" });
  const path = join(directory, `payment-${crypto.randomUUID()}.json`);
  await writeFile(path, JSON.stringify(body), { flag: "wx", mode: 0o600 });
  const endpoint = new URL("/api/managed/v1/checkout/mpp", origin).href;
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "error" });
  if (response.status !== 402) throw new Error(`Expected a payment challenge, received HTTP ${response.status}`);
  print("Payment request prepared. Review the amount in your Tempo wallet. This request expires in four minutes.");
  print(`tempo request -X POST --json "$(cat ${quote(path)})" ${quote(endpoint)}`);
  print("Keep the returned order_id. Use status ORDER_ID to check settlement without paying again.");
} else if (command === "status") {
  if (!args[0]) throw new Error("Pass the order_id returned by the payment request");
  print(await call("checkout/status", { order_id: args[0] }));
} else if (command === "infer") {
  const [model, maximum, ...words] = args;
  if (!model || !maximum || !/^\d{1,3}(\.\d{1,2})?$/.test(maximum) || !words.length) {
    throw new Error('Usage: infer MODEL MAXIMUM_USD "Your prompt"');
  }
  const maximumMicros = Math.round(Number(maximum) * 1_000_000);
  if (maximumMicros <= 0 || maximumMicros > 100_000_000) throw new Error("Choose a positive maximum of at most 100 USD");
  const catalog = await call("catalog", {});
  const price = catalog.models.find((item: any) => item.model === model);
  if (!price) throw new Error("Choose a model returned by the models command");
  const execution = `lab_${crypto.randomUUID()}`;
  const reservation = await call("reserve", { command_id: execution, execution_id: execution, model, privacy: "standard",
    maximum_microusd: maximumMicros, pricing_snapshot_at: price.snapshot_at,
    input_microusd_per_million: price.input_microusd_per_million,
    output_microusd_per_million: price.output_microusd_per_million });
  const response = await fetch(new URL("/api/managed/v1/chat/completions", origin), {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${reservation.capability}` },
    body: JSON.stringify({ model, privacy: "standard", messages: [{ role: "user", content: words.join(" ") }], max_tokens: 256, stream: false }),
    redirect: "error",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Compute returned HTTP ${response.status}`);
  print(result.choices?.[0]?.message?.content ?? result);
  print(await call("balance", {}));
} else {
  print("Commands: init | balance | models | checkout [usd_10|usd_25|usd_50] | tempo [pack] | status ORDER_ID | infer MODEL MAXIMUM_USD PROMPT");
}
