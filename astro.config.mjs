import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://cinappses.org",
  trailingSlash: "never",
  build: { format: "file" },
  vite: { server: { allowedHosts: ["botan.tail843dce.ts.net"] } },
});
