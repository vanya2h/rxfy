import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Distinct HMR port so this example can run alongside the other Vite examples (which use Vite's
  // default 24678) without a "port already in use" collision.
  server: { hmr: { port: 24679 } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  ssr: {
    noExternal: ["examples-shared"],
  },
  optimizeDeps: {
    exclude: ["examples-shared"],
  },
});
