import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFile } from "node:fs/promises";
/** Separate non-inline build: the existing standalone single HTML is unchanged. */
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), { name: "extension-manifest", closeBundle: async () => { await copyFile("extension/manifest.json", "dist/extension/manifest.json"); } }],
  resolve: { alias: { "@": path.resolve("src") } },
  build: { outDir: "dist/extension", emptyOutDir: true, rollupOptions: {
    input: { index: "index.html", background: "extension/background.ts" },
    output: { entryFileNames: chunk => chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js" },
  } },
});
