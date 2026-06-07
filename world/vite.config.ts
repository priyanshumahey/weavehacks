import { defineConfig } from "vite";

// The Phaser world proxies /api to the FastAPI scene backend (uvicorn :8000),
// so the browser can stage live scenes without CORS juggling in dev.
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
