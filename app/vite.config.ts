import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

// The Compact runtime ships its on-chain VM as WebAssembly; vite-plugin-wasm
// lets Vite bundle that ESM-wasm import. Top-level await is used by the
// wasm glue and is native in every current browser, so target esnext.
export default defineConfig({
  base: "./",
  plugins: [wasm()],
  build: { target: "esnext", chunkSizeWarningLimit: 4000 },
  esbuild: { target: "esnext" },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  server: { fs: { allow: [".."] } }
});
