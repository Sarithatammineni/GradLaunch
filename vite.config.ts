import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "client",
  publicDir: "public",
  build: { outDir: "../.generated/client", emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: false }
    }
  },
  test: {
    root: "..",
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
