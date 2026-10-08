import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.menloapp.lol",
  integrations: [
    starlight({
      title: "menloapp",
      description:
        "Share, install, and create iPhone apps.",
      favicon: "/menlo-mark.svg",
      logo: { src: "./public/menlo-mark.svg", alt: "", replacesTitle: false },
      customCss: ["./src/styles/starlight.css"],
      editLink: {
        baseUrl:
          "https://github.com/jpfraneto/menloapp/edit/main/website/docs-pages/src/content/docs/",
      },
      social: [
        {
          icon: "github",
          label: "menloapp on GitHub",
          href: "https://github.com/jpfraneto/menloapp",
        },
      ],
      head: [
        {
          tag: "link",
          attrs: {
            rel: "alternate",
            type: "text/plain",
            href: "/llms.txt",
            title: "menloapp docs for AI agents",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://menloapp.lol/menlo/hero-sharing.png?v=1",
          },
        },
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#f6f3ea" },
        },
      ],
      lastUpdated: true,
      sidebar: [
        { label: "Home", link: "/" },
        {
          label: "Get started",
          items: [
            "guide/start/requirements",
            "guide/start/share-an-app",
            "guide/start/install-and-onboard",
            "guide/start/create-an-app",
            "guide/start/evolve-an-app",
            "guide/operations/troubleshooting",
          ],
        },
        {
          label: "More",
          collapsed: true,
          items: [
            "guide/product/app-listing",
            "guide/security/source-reviews",
            "guide/security/source-safety",
            "guide/start/adopt-an-app",
            "guide/reference/current-status",
            { label: "Technical reference", link: "/guide/" },
          ],
        },
      ],
    }),
  ],
});
