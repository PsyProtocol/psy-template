import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5273,
    strictPort: true,
    cors: false,
    proxy: {
      "/api/markets": {
        target: "http://127.0.0.1:5274",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/markets/, ""),
      },
    },
    fs: {
      strict: true,
      allow: [fileURLToPath(new URL("..", import.meta.url))],
      deny: [
        "**/.git/**",
        "**/.env*",
        "**/.secrets/**",
        "**/*private_keys*",
        "**/*keystore*",
      ],
    },
  },
});
