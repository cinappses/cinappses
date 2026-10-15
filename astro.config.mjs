import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://cinappses.org",
  vite: { server: { allowedHosts: ["botan.tail843dce.ts.net"] } },
});
