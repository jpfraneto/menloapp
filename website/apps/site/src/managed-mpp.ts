import { Database } from "bun:sqlite";
import { closeSync, constants, lstatSync, openSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import StripeClient from "stripe";
import { Mppx, type Store } from "mppx/server/core";
import { stripe } from "mppx/stripe/server";
import type { ManagedConfig } from "../config.ts";

export interface MachinePaymentOrder {
  id: string;
  installation_binding: string;
  pack_id: string;
  amount_cents: number;
  expires_at: string;
  receipt: string | null;
  payment_id: string | null;
  attempted_at: string | null;
}

/** The adapter verifies payment; only the Stripe webhook credits the ledger. */
export interface MachinePaymentGateway {
  charge(request: Request, order: MachinePaymentOrder): Promise<Response>;
}

/** Durable orders and atomic replay protection on the existing operator volume. */
export class MachinePaymentStore {
  readonly db: Database;
  readonly replay: Store.AtomicStore;

  constructor(root: string) {
    const path = join(root, "machine-payments.sqlite");
    closeSync(openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600));
    if (!lstatSync(path).isFile()) throw new Error("machine payment storage is unsafe");
    this.db = new Database(path, { strict: true });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, installation_binding TEXT NOT NULL, pack_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, expires_at TEXT NOT NULL,
        receipt TEXT, payment_id TEXT, attempted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS replay (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    const read = (key: string): unknown => {
      const row = this.db.query<{ value: string }, [string]>("SELECT value FROM replay WHERE key = ?").get(key);
      return row ? JSON.parse(row.value) : null;
    };
    const put = (key: string, value: unknown) => {
      this.db.query("INSERT INTO replay (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(key, JSON.stringify(value));
    };
    const remove = (key: string) => { this.db.query("DELETE FROM replay WHERE key = ?").run(key); };
    this.replay = {
      async get(key) { return read(key); },
      async put(key, value) { put(key, value); },
      async delete(key) { remove(key); },
      update: async (key, fn) => this.db.transaction(() => {
        const change = fn(read(key));
        if (change.op === "set") put(key, change.value);
        if (change.op === "delete") remove(key);
        return change.result;
      }).immediate(),
    };
  }

  order(binding: string, claimId: string, pack: string, amountCents: number, expires: string): MachinePaymentOrder {
    const id = createHash("sha256").update(`menloapp.mpp.order/1\0${binding}\0${claimId}`).digest("hex");
    this.db.query("INSERT OR IGNORE INTO orders (id, installation_binding, pack_id, amount_cents, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, binding, pack, amountCents, expires);
    const order = this.get(id)!;
    if (order.installation_binding !== binding || order.pack_id !== pack || order.amount_cents !== amountCents || order.expires_at !== expires) {
      throw new Error("machine payment order conflicts with existing work");
    }
    return order;
  }

  get(id: string): MachinePaymentOrder | null {
    return this.db.query<MachinePaymentOrder, [string]>("SELECT * FROM orders WHERE id = ?").get(id);
  }

  paid(id: string, receipt: string): void {
    // A receipt is payment evidence, never spendable balance authority.
    this.db.query("UPDATE orders SET receipt = COALESCE(receipt, ?) WHERE id = ?").run(receipt, id);
  }

  attempted(id: string): void {
    this.db.query("UPDATE orders SET attempted_at = COALESCE(attempted_at, ?) WHERE id = ?").run(new Date().toISOString(), id);
  }

  credited(id: string, paymentId: string): void {
    this.db.query("UPDATE orders SET payment_id = COALESCE(payment_id, ?) WHERE id = ?").run(paymentId, id);
  }
}

export function createStripeMachineGateway(config: ManagedConfig, store: MachinePaymentStore, origin: string): MachinePaymentGateway {
  const settings = config.machinePayments;
  if (!settings || !config.stripeSecretKey) throw new Error("machine payments are not configured");
  const client = new StripeClient(config.stripeSecretKey, { maxNetworkRetries: 2, timeout: 30_000 });
  const methods = stripe.create({
    client,
    networkId: settings.stripeProfileId,
    livemode: /^(sk|rk)_live_/.test(config.stripeSecretKey),
    depositAddresses: { tempo: settings.tempoDepositAddress },
    store: store.replay,
  });
  const mpp = Mppx.create({ methods: methods.defaultMethods(), secretKey: settings.challengeSecret, realm: new URL(origin).host });
  return {
    async charge(request, order) {
      const result = await mpp.charge({
        amount: (order.amount_cents / 100).toFixed(2),
        description: "Menlo compute balance",
        expires: order.expires_at,
        externalId: order.id,
        scope: `menloapp:managed-topup:${order.id}`,
        meta: { order_id: order.id },
        paymentIntentOptions: { metadata: {
          menloapp_payment_kind: "managed_topup",
          menloapp_order_id: order.id,
        } },
      })(request);
      if (result.status === 402) return result.challenge;
      return result.withReceipt(new Response(null, { status: 200 }));
    },
  };
}

export function machineReceipt(response: Response): string {
  const encoded = response.headers.get("payment-receipt");
  if (!encoded || encoded.length > 16_384) throw new Error("machine payment receipt is missing");
  const receipt = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (receipt.status !== "success" || !["stripe", "tempo"].includes(receipt.method)
      || typeof receipt.reference !== "string" || !receipt.reference) {
    throw new Error("machine payment receipt is invalid");
  }
  return encoded;
}
