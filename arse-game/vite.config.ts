import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  assetsInclude: ["**/*.glb"],
  build: {
    // The hero model (src/assets/invincible.glb, ~2MB) needs to be inlined as a
    // base64 data URI so it ends up embedded in the single built HTML file, same
    // as everything else this project ships (see scripts/build-apk.py).
    assetsInlineLimit: 8 * 1024 * 1024,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
