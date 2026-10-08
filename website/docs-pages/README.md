# Menlo documentation

The static Astro Starlight site served at https://docs.menloapp.lol. The main
website’s `/docs` route redirects here, including “I want to go deeper.”

Edit `src/content/docs/` and keep the explanation consistent with `protocol/`,
accepted `docs/adr/` decisions, implementation, and the evidence in `docs/STATE.md`.
Historical Registry material must stay distinct from ordinary GitHub distribution.

From this directory:

```sh
bun run check
bun run build
bun run verify
```

The build regenerates `llms.txt` and `llms-full.txt`, copies shared assets, and
creates search and sitemap output. Verification checks current entry paths,
historical scope, assets, internal links, and anchors.

Deploy the verified output from committed `main` to the existing Cloudflare Pages
project using the operator’s authenticated Wrangler session:

```sh
wrangler pages deploy dist --project-name menloapp-docs --branch main
```

The hosting project is `menloapp-docs`. Its custom domain
is `docs.menloapp.lol`, with a Namecheap `CNAME` for host `docs` pointing to
`menloapp-docs.pages.dev`. Cloudflare must validate that record and HTTPS before
the main website’s updated docs redirect is deployed.

Check the public `/docs` redirect, home, changed guides, and AI feeds after
deployment. This publishes explanatory docs; it does not release the native app,
change installer pins, activate contracts, or establish physical acceptance.
