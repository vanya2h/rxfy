import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: ["rxfy-server"],
    },
  },
  ssr: {
    noExternal: ["rxfy-server"],
  },
});
