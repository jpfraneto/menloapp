# Run paid compute with Menlo, Stripe, and Tempo

Menlo's rule is explicit: every execution needs a machine and compute.
The person running it supplies those resources. A paid managed route
collects money before admitting model work, reserves the approved maximum,
and accounts for actual use. Local coding agents continue to use the
operator's configured agent account and machine.

This tutorial is a runnable implementation case study of the payment and
compute boundary. It uses Menlo's existing signed-installation identity,
Stripe Checkout, capped balance ledger, and inference proxy. Tempo adds
MPP payments to that same system. It does not introduce another build
engine or change the native app's signing and intended-iPhone rules.

## 1. Run the executable checks

You need Git and Bun. Start with a fresh checkout pinned to the tested
implementation commit:

```sh
git clone https://github.com/jpfraneto/menloapp.git
cd menloapp
git checkout 6e8fd9f20c40abfb07fda3124023a4b00cf51880
cd website
bun install --frozen-lockfile
bun run payments:test
```

These checks require no account credentials and move no funds. They exercise
the real MPP SDK's unpaid `402` response, signed requests, persistent replay
protection, payment recovery, webhook fulfillment, balance reservations,
refunds, disputes, and compute limits. Payment success and upstream inference
are controlled fixtures in these checks, not real Stripe transactions or
physical app installations.

## 2. Decide what your node supplies

| Resource | What the operator supplies |
| --- | --- |
| Payment service | Bun process, durable volume, Stripe account and webhook |
| Managed model compute | Configured Bankr gateway account, funding, and allowed models |
| Native app build | Mac, Xcode, configured coding agent, Apple identity, intended iPhone |
| Farcaster data or publishing | The appropriate Farcaster/Hypersnap endpoint and protocol authority |

Configure the network connection and execution provider independently.
Farcaster/Hypersnap supplies its network function; the build runner needs
its own execution resources. Keep signer approval and keys in their existing
Farcaster boundary. This change does not implement a Farcaster job transport,
launch a Hypersnap node, or pay third-party node operators.

## 3. Configure a Stripe sandbox

Use a dedicated Stripe sandbox. In that account:

1. Create one-time USD Prices for exactly **$10, $25, and $50** of compute
   balance. These are funding packs, not fixed quotes for complete apps.
2. Create or retrieve its Stripe business profile ID.
3. Enable the relevant machine-payment methods and create a **Tempo deposit
   address owned by the same Stripe account and mode**.
4. Create a restricted API key with the permissions needed for Checkout
   Sessions, Prices, PaymentIntents, and the machine-payment resources in
   Stripe's integration guide. Keep it server-side.

Follow the current [Stripe MPP guide](https://docs.stripe.com/payments/machine/mpp)
for profile/deposit-address setup. Stablecoin access is account-dependent:
Stripe documents US availability with a New York exclusion, and an access
request path for businesses outside the US. Verify access for the actual
merchant entity. Do not infer eligibility from where the operator lives.

Use the secret manager for a hosted instance. For a local sandbox, a private,
ignored `website/.env.local` can provide:

```dotenv
NODE_ENV=development
BASE_URL=http://127.0.0.1:3000
PORT=3000
MANAGED_COMPUTE_ENABLED=true
MANAGED_COMPUTE_PROVIDER=bankr
MANAGED_COMPUTE_ROOT=/absolute/private/path/menloapp-compute
MANAGED_MPP_ENABLED=true
STRIPE_SECRET_KEY=<sandbox-restricted-API-key>
STRIPE_WEBHOOK_SECRET=<forwarder's-signing-secret>
STRIPE_BALANCE_PRICE_10=<sandbox-price-ID>
STRIPE_BALANCE_PRICE_25=<sandbox-price-ID>
STRIPE_BALANCE_PRICE_50=<sandbox-price-ID>
STRIPE_PROFILE_ID=<sandbox-profile-ID>
TEMPO_DEPOSIT_ADDRESS=<same-account-sandbox-Tempo-address>
MPP_SECRET_KEY=<independent-random-secret-at-least-32-bytes>
MANAGED_CHECKOUT_SUCCESS_URL=https://menloapp.lol/billing/success
MANAGED_CHECKOUT_CANCEL_URL=https://menloapp.lol/billing/cancel
BANKR_API_KEY=<gateway-key>
BANKR_MODEL_ALLOWLIST=<allowed-model-ID>
TOHSENO_OPERATOR_TOKEN_SHA256=<SHA-256-of-private-operator-token>
```

Replace placeholders before starting. The existing gateway requires a real
configured supplier key, even when Stripe payments use a sandbox. A sandbox
card charge does not fund your supplier account, and an inference call can
consume real supplier credit. The `infer` command therefore requires an
explicit spending ceiling.

Run one terminal for Stripe forwarding, using the official Stripe CLI:

```sh
stripe listen \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,payment_intent.succeeded,charge.refunded,charge.dispute.created,charge.dispute.closed \
  --forward-to http://127.0.0.1:3000/api/managed/v1/stripe/webhook
```

Put its signing secret in the private environment, then start another terminal:

```sh
bun --env-file=.env.local apps/site/server.ts
```

The server refuses incomplete payment configuration. MPP uses Tempo testnet
when the Stripe key is a sandbox key. Confirm the wallet and deposit address
use that same test network before authorizing a payment.

## 4. Create a local lab identity

From `website/`:

```sh
bun run payments:client init
bun run payments:client balance
```

The client keeps an Ed25519 lab identity under your home directory with private
file permissions. Keep it to retain access to its balance. `init` refuses to
overwrite an existing key. `MENLOAPP_PAYMENT_STATE` chooses another directory;
`MENLOAPP_PAYMENT_ORIGIN` chooses an HTTPS operator service or local loopback.

This identity is **separate from the native Mac factory identity**. This lab
proves the paid-compute API. Funding it does not fund a different native
installation. The native Stripe purchase flow signs with its own existing
workspace identity.

## 5. Pay through Stripe Checkout

```sh
bun run payments:client checkout usd_10
```

Open the returned Stripe URL, review the amount and sandbox indicator, and
complete the sandbox payment. Then:

```sh
bun run payments:client balance
```

Expect 10,000,000 micro-USD of paid balance. Closing the browser after paying
does not lose the purchase: the signed webhook fulfills it. A completed but
unpaid delayed Checkout Session grants zero balance; its later successful
payment event completes fulfillment.

## 6. Pay through Tempo

Install and configure the official [Tempo CLI](https://tempo.xyz/developers/docs/cli)
for the matching test network. Then prepare a signed, short-lived request:

```sh
bun run payments:client tempo usd_10
```

The client checks for an unpaid `402` challenge, saves the exact request, and
prints a `tempo request` command. Run that command after reviewing its amount
in the wallet. The wallet signs; the Menlo server does not hold the payer's key.

Save the returned `order_id` and inspect it without another payment:

```sh
bun run payments:client status <order_id>
bun run payments:client balance
```

The order initially reports `settlement_pending`. It becomes `credited` only
when Stripe's signed webhook arrives and the server retrieves a matching,
successful PaymentIntent. Reusing the exact paid request recovers its saved
receipt; it does not initiate another charge. A fresh signed status request
also works after the payment request expires.

`verification_pending` means a payment credential was submitted but its final
outcome is not yet established. The durable marker prevents another payment
attempt on that order, including after a server restart. Reconcile the order
with Stripe and the original transaction before deciding its outcome.

If a paid order remains pending, reconcile that order. Do not create a new
purchase to recover a lost response. Stripe's SDK recording of an on-chain
payment can fail independently of the on-chain transfer, so the receipt alone
is deliberately insufficient to grant spendable balance.

## 7. Run one bounded compute call

List the operator's real model catalog:

```sh
bun run payments:client models
```

Choose an allowed model ID and approve a maximum, in USD:

```sh
bun run payments:client infer <model-id> 0.50 "Describe a simple four-six breathing timer in three sentences."
```

The server reserves at most $0.50 before using the provider, records actual
use, and releases the unused reservation. Insufficient balance prevents
provider use. An ambiguous upstream outcome stays held for reconciliation;
it is not silently retried as a new billable task. The command prints the
result and updated balance.

Native app generation then uses the existing Mac factory, approved route,
app folder, and intended iPhone. This tutorial has not added the proposed
browser composer, automatic computer pairing, or a web-to-agent dispatcher.

## Turn the walkthrough into a public case study

Publish one observed run: the intent, chosen machine/provider, approved cap,
payment receipt reference, actual cost, elapsed time, and resulting app.
Record what happened when the response was lost or a build failed. Keep
keys, private source, raw signers, and personal account records out of it.

Use **“Payments via Tempo”** on the Tempo payment option or a confirmed Tempo
receipt. **“Powered by Tempo”** can describe a demonstrated Tempo-backed
payment path; it should not imply that Tempo performs the code generation
or has endorsed Menlo. A configured flag or sandbox fixture is not evidence
of a live integration.

The first invitation is concrete: **run the checks, connect your compute,
make a sandbox payment, run one bounded request, and share your result.**
Real invitations or public posts are separate publication actions.

## Implementation notes and sources

- Human checkout: `POST /api/managed/v1/checkout`.
- Agent checkout: `POST /api/managed/v1/checkout/mpp`, signed action `checkout_mpp`.
- Order recovery: `POST /api/managed/v1/checkout/status`, signed action `checkout_status`.
- Method availability: `GET /api/managed/v1/payment-methods`.
- Ledger fulfillment: `POST /api/managed/v1/stripe/webhook`.
- Capped execution: the existing signed `catalog`, `reserve`, and capability
  `chat/completions` endpoints.
- Replay/order state: `MANAGED_COMPUTE_ROOT/machine-payments.sqlite`; back up
  SQLite consistently with its WAL and the append-only ledger. All processes
  must share the same local durable volume.
- [Stripe MPP](https://docs.stripe.com/payments/machine/mpp),
  [availability](https://docs.stripe.com/payments/machine),
  [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment),
  [MPP protocol](https://mpp.dev),
  [managed-compute operations](../runbooks/MANAGED_COMPUTE.md).

This change ships code and executable checks. Live Stripe account activation,
an actual Tempo payment, and a completed physical app installation require
their own observed evidence.
