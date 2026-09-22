import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  cacheDir: "../../node_modules/.vite/frontend",
  clearScreen: false,
  server: { port: 5173, strictPort: false },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
      },
    },
  },
});
