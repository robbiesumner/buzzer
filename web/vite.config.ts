import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const PYTHON_SERVER = process.env.SERVER_ORIGIN ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: PYTHON_SERVER, changeOrigin: true },
      "/socket.io": { target: PYTHON_SERVER, ws: true, changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
