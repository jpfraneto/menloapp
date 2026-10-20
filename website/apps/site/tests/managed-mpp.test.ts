import { afterEach, describe, expect, test } from "bun:test";
import { createHash, createHmac, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "mppx/server/core";
import { loadConfig } from "../config.ts";
import { balanceProjection, createManagedRouter, installationBinding, type ManagedProvider } from "../src/managed.ts";
import { MachinePaymentStore, type MachinePaymentGateway } from "../src/managed-mpp.ts";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
const provider: ManagedProvider = {
  async models() { return { data: [] }; },
  async credits() { return {}; },
  async usage() { return {}; },
  async completion() { throw new Error("payment tests must not run inference"); },
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "menloapp-mpp-")); roots.push(root);
  const env = {
    NODE_ENV: "test", BASE_URL: "http://localhost:3000", MANAGED_COMPUTE_ENABLED: "true",
    MANAGED_COMPUTE_PROVIDER: "fake", MANAGED_COMPUTE_ROOT: root,
    STRIPE_SECRET_KEY: "rk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_BALANCE_PRICE_10: "price_10", STRIPE_BALANCE_PRICE_25: "price_25", STRIPE_BALANCE_PRICE_50: "price_50",
    MANAGED_CHECKOUT_SUCCESS_URL: "https://menloapp.lol/billing/success",
    MANAGED_CHECKOUT_CANCEL_URL: "https://menloapp.lol/billing/cancel",
    BANKR_MODEL_ALLOWLIST: "test-model", TOHSENO_OPERATOR_TOKEN_SHA256: "a".repeat(64),
    MANAGED_MPP_ENABLED: "true", STRIPE_PROFILE_ID: "profile_test_fixture",
    TEMPO_DEPOSIT_ADDRESS: `0x${"1".repeat(40)}`, MPP_SECRET_KEY: "a-test-only-challenge-secret-with-32-bytes",
  };
  const keys = generateKeyPairSync("ed25519");
  const raw = (keys.publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(-32).toString("base64url");
  const binding = installationBinding(raw);
  function signed(action: string, request: unknown, claimId = `claim_${crypto.randomUUID()}`) {
    const now = Date.now();
    const payload = canonical({ schema: "tohseno.private-managed-claim/1", claim_id: claimId,
      installation_binding: binding, signing_public_key_base64url: raw, action,
      request_digest: createHash("sha256").update(canonical(request)).digest("base64url"),
      issued_at: new Date(now).toISOString(), expires_at: new Date(now + 120_000).toISOString() });
    return JSON.stringify({ request, claim: { schema: "tohseno.private-managed-claim-envelope/1",
      payload_base64url: Buffer.from(payload).toString("base64url"),
      signature_base64url: sign(null, Buffer.concat([Buffer.from("tohseno.managed.claim.v1\0"), Buffer.from(payload)]), keys.privateKey).toString("base64url") } });
  }
  return { env, config: loadConfig(env), root, binding, signed };
}

function canonical(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

function post(path: string, body: string, payment = false) {
  return new Request(`http://localhost:3000/api/managed/v1/${path}`, { method: "POST",
    headers: { "content-type": "application/json", ...(payment ? { authorization: "Payment test-credential" } : {}) }, body });
}

function webhook(object: unknown, id = "evt_mpp", type = "payment_intent.succeeded") {
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ id, type, data: { object } });
  const signature = createHmac("sha256", "whsec_fixture").update(`${now}.${body}`).digest("hex");
  return new Request("http://localhost:3000/api/managed/v1/stripe/webhook", { method: "POST", body,
    headers: { "stripe-signature": `t=${now},v1=${signature}` } });
}

describe("paid compute through Stripe and Tempo", () => {
  test("MPP configuration fails closed and supports restricted Stripe keys", () => {
    const { env } = fixture();
    expect(loadConfig(env).managed.stripeSecretKey).toStartWith("rk_test_");
    expect(() => loadConfig({ ...env, MPP_SECRET_KEY: "short" })).toThrow("32 bytes");
    expect(() => loadConfig({ ...env, TEMPO_DEPOSIT_ADDRESS: "not-an-address" })).toThrow("TEMPO_DEPOSIT_ADDRESS");
    expect(() => loadConfig({ ...env, MANAGED_COMPUTE_ENABLED: "false" })).toThrow("require managed compute");
  });

  test("the real SDK offers a scoped 402 without granting compute balance", async () => {
    const f = fixture();
    const router = await createManagedRouter(f.config, provider);
    const response = await router.fetch(post("checkout/mpp", f.signed("checkout_mpp", { pack_id: "usd_10" })));
    expect(response.status).toBe(402);
    expect(response.headers.get("www-authenticate")).toContain("Payment");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await balanceProjection(f.root, f.binding)).paid_microusd).toBe(0);
  });

  test("human Checkout uses the signed server price and a stable retry key", async () => {
    const f = fixture(); const requests: RequestInit[] = [];
    const router = await createManagedRouter(f.config, provider, (async (_url: any, init: any) => {
      requests.push(init);
      return Response.json({ url: "https://checkout.stripe.com/c/pay/cs_fixture" });
    }) as unknown as typeof fetch);
    const body = f.signed("checkout", { pack_id: "usd_25" });
    expect((await router.fetch(post("checkout", body))).status).toBe(201);
    expect((await router.fetch(post("checkout", body))).status).toBe(201);
    const params = requests[0]!.body as URLSearchParams;
    expect(params.get("mode")).toBe("payment");
    expect(params.get("line_items[0][price]")).toBe("price_25");
    expect(params.get("integration_identifier")).toMatch(/^menloapp_[a-z]{8}$/);
    expect(params.has("payment_method_types")).toBeFalse();
    expect(new Headers(requests[0]!.headers).get("idempotency-key"))
      .toBe(new Headers(requests[1]!.headers).get("idempotency-key"));
    expect((await balanceProjection(f.root, f.binding)).paid_microusd).toBe(0);
  });

  test("paid retries recover one receipt; only a retrieved Stripe payment credits once", async () => {
    const f = fixture(); let calls = 0;
    let intent: any;
    const gateway: MachinePaymentGateway = {
      async charge(_request, order) {
        calls += 1;
        intent = { id: "pi_tempo", status: "succeeded", currency: "usd", amount: 1000, amount_received: 1000, livemode: false,
          metadata: { menloapp_payment_kind: "managed_topup", menloapp_order_id: order.id } };
        return new Response(null, { headers: { "payment-receipt": Buffer.from(JSON.stringify({ method: "tempo", status: "success",
          reference: `0x${"a".repeat(64)}`, timestamp: new Date().toISOString() })).toString("base64url") } });
      },
    };
    const fetchStub = async () => Response.json(intent);
    const router = await createManagedRouter(f.config, provider, fetchStub as unknown as typeof fetch, gateway);
    const body = f.signed("checkout_mpp", { pack_id: "usd_10" });
    const [first, retry] = await Promise.all([router.fetch(post("checkout/mpp", body, true)), router.fetch(post("checkout/mpp", body, true))]);
    expect(first.status, await first.clone().text()).toBe(202);
    expect(retry.status, await retry.clone().text()).toBe(202); expect(calls).toBe(1);
    expect(retry.headers.get("payment-receipt")).toBe(first.headers.get("payment-receipt"));
    expect((await balanceProjection(f.root, f.binding)).paid_microusd).toBe(0);
    expect((await router.fetch(webhook(intent))).status).toBe(200);
    expect((await router.fetch(webhook(intent, "evt_mpp_again"))).status).toBe(200);
    expect((await balanceProjection(f.root, f.binding)).paid_microusd).toBe(10_000_000);
    expect((await router.fetch(post("checkout/mpp", body))).status).toBe(200); expect(calls).toBe(1);
    expect((await router.fetch(webhook({ payment_intent: "pi_tempo", amount_refunded: 200 }, "evt_refund", "charge.refunded"))).status).toBe(200);
    expect((await balanceProjection(f.root, f.binding)).paid_microusd).toBe(8_000_000);
  });

  test("a lost payment outcome remains recoverable across restart without another charge", async () => {
    const f = fixture(); let calls = 0;
    const gateway: MachinePaymentGateway = { async charge() { calls += 1; throw new Error("connection lost after submit"); } };
    const body = f.signed("checkout_mpp", { pack_id: "usd_10" });
    const firstRouter = await createManagedRouter(f.config, provider, fetch, gateway);
    const first = await firstRouter.fetch(post("checkout/mpp", body, true));
    expect(first.status).toBe(202);
    const pending = await first.json(); expect(pending.payment_status).toBe("verification_pending");
    const restarted = await createManagedRouter(f.config, provider, fetch, gateway);
    const retry = await restarted.fetch(post("checkout/mpp", body, true));
    expect(retry.status).toBe(202); expect(calls).toBe(1);
    const status = await restarted.fetch(post("checkout/status", f.signed("checkout_status", { order_id: pending.order_id })));
    expect((await status.json()).payment_status).toBe("verification_pending");
    expect((await balanceProjection(f.root, f.binding)).paid_microusd).toBe(0);
  });

  test("a forged webhook, wrong total, or unknown order never grants credit", async () => {
    const f = fixture();
    const intent = { id: "pi_wrong", status: "succeeded", currency: "usd", amount: 1000, amount_received: 1000, livemode: false,
      metadata: { menloapp_payment_kind: "managed_topup", menloapp_order_id: "unknown" } };
    const router = await createManagedRouter(f.config, provider, (async () => Response.json(intent)) as unknown as typeof fetch);
    const forged = webhook(intent); forged.headers.set("stripe-signature", "invalid");
    expect((await router.fetch(forged)).status).toBe(400);
    expect((await router.fetch(webhook(intent))).status).toBe(400);
    const store = new MachinePaymentStore(f.root);
    const order = store.order(f.binding, "claim_wrong", "usd_10", 1000, new Date(Date.now() + 60_000).toISOString());
    intent.metadata.menloapp_order_id = order.id; intent.amount_received = 999;
    expect((await router.fetch(webhook(intent))).status).toBe(400);
    expect((await balanceProjection(f.root, f.binding)).paid_microusd).toBe(0);
    store.db.close();
  });

  test("requests are signed, pack prices are server-owned, and inactive MPP is unavailable", async () => {
    const f = fixture(); let calls = 0;
    const gateway: MachinePaymentGateway = { async charge() { calls += 1; throw new Error("must not charge"); } };
    const router = await createManagedRouter(f.config, provider, fetch, gateway);
    const original = JSON.parse(f.signed("checkout_mpp", { pack_id: "usd_10" }));
    original.request.pack_id = "usd_50";
    expect((await router.fetch(post("checkout/mpp", JSON.stringify(original)))).status).toBe(400);
    expect((await router.fetch(post("checkout/mpp", f.signed("checkout_mpp", { pack_id: "__proto__" })))).status).toBe(400);
    expect(calls).toBe(0);
    const disabled = await createManagedRouter(loadConfig({ ...f.env, MANAGED_MPP_ENABLED: "false" }), provider);
    expect((await disabled.fetch(post("checkout/mpp", f.signed("checkout_mpp", { pack_id: "usd_10" })))).status).toBe(503);
  });

  test("Tempo replay claims remain atomic across connections and restarts", async () => {
    const { root } = fixture(); const first = new MachinePaymentStore(root); const second = new MachinePaymentStore(root);
    const expires = Date.now() + 60_000;
    const results = await Promise.all([Store.tryClaim(first.replay, "tx_same", expires), Store.tryClaim(second.replay, "tx_same", expires)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    first.db.close(); second.db.close();
    const reopened = new MachinePaymentStore(root);
    expect(await Store.tryClaim(reopened.replay, "tx_same", expires)).toBeFalse();
    reopened.db.close();
  });

  test("delayed Checkout completion is acknowledged without granting credit", async () => {
    const f = fixture();
    const session = { id: "cs_delayed", payment_status: "unpaid" };
    const router = await createManagedRouter(f.config, provider, (async () => Response.json(session)) as unknown as typeof fetch);
    expect((await router.fetch(webhook({ id: session.id }, "evt_unpaid", "checkout.session.completed"))).status).toBe(200);
    expect((await balanceProjection(f.root, f.binding)).paid_microusd).toBe(0);
  });
});
