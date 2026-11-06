import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { satteri } from "@astrojs/markdown-satteri";
import photos from "./src/lib/photos.ts";

export default defineConfig({
  site: "https://cinappses.org",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [sitemap({ filter: (page) => !page.endsWith("/404") })],
  markdown: { processor: satteri({ hastPlugins: [photos] }) },
  vite: { server: { allowedHosts: ["botan.tail843dce.ts.net"] } },
});
