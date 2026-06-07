import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev server proxies:
//  - /api/copilotkit -> the Node CopilotKit runtime (chat streaming)
//  - /api            -> the FastAPI scene backend (uvicorn :8000)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/copilotkit": {
        target: "http://localhost:4100",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
