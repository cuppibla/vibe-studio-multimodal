import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev: Vite serves the SPA on 5173 and proxies everything the backend owns
// (the JSON API, the SSE stream, the mounted ADK dev UI, and generated media)
// to the FastAPI server on 4600. Prod: `npm run build` writes web/dist, which
// the same FastAPI server serves at /, so one port carries the whole app.
const BACKEND = "http://127.0.0.1:4600";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/inspector": { target: BACKEND, changeOrigin: true, ws: true },
      "/static": { target: BACKEND, changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
