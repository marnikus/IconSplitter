import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { computeSrcFingerprint } from "./tools/bridge/distfresh.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function stampSrcHashPlugin() {
  return {
    name: "iconsplitter-stamp-src-hash",
    transformIndexHtml(html: string) {
      const watch = [path.join(__dirname, "src"), path.join(__dirname, "index.html")];
      const fp = computeSrcFingerprint(watch);
      return html.replace("<head>", `<head>\n    <meta name="iconsplitter-src-hash" content="${fp}" />`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [stampSrcHashPlugin(), react(), tailwindcss(), viteSingleFile()],
  // The helper builds into a staging folder and swaps the result into dist/ only
  // when it is complete (tools/bridge/appbuild.mjs); a plain `npm run build` writes dist/.
  build: {
    outDir: process.env.ICONSPLITTER_OUT_DIR || "dist",
    emptyOutDir: true,
  },
  server: {
    // Allow any hostname so the dev server can be reached through
    // proxies/previews (e.g. remote sandboxes), not just localhost.
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
