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
