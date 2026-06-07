import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev server proxies:
//  - /api/copilotkit -> the Node CopilotKit runtime (chat streaming)
//  - /api            -> the FastAPI chat backend (characters, episodes, prepare,
//                       inner-state)
// Order matters: the more specific /api/copilotkit rule is listed first.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
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
