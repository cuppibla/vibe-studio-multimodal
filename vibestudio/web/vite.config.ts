import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite on 5174 proxies the API, the SSE stream and media to the app's
// server on 4700. Prod: `npm run build` writes dist/, which that server
// serves at /, so one port carries the whole app.
const BACKEND = "http://127.0.0.1:4700";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/static": { target: BACKEND, changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
